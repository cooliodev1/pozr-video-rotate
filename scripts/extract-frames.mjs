import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const defaults = {
  input: 'input.mp4',
  output: 'public/frames',
  count: 24,
  format: 'webp',
  quality: 80,
  prefix: 'frame',
  width: 320,
  crop: '',
  start: 0,
  end: null,
  startAngle: 0,
  direction: 'clockwise',
  timestamps: '',
  force: false,
};

const usage = `
Usage:
  npm run extract -- --input input.mp4 --count 24

Options:
  --input <path>      Video file to sample. Default: input.mp4
  --output <dir>      Folder for generated frames. Default: public/frames
  --count <number>    Number of evenly spaced frames to export. Default: 24
  --format <jpg|png|webp>  Image format. Default: jpg
  --quality <number>  ffmpeg quality value for jpg/webp. Lower is better. Default: 3
  --prefix <name>     Output filename prefix. Default: frame
  --width <pixels>    Resize frames to this width. Use 0 for original size. Default: 960
  --start <seconds>   Timestamp of the calibrated 0-degree pose. Default: 0
  --end <seconds>     Exclusive timestamp where the pose completes 360 degrees. Default: video end
  --start-angle <degrees>  Model yaw represented by the first frame. Default: 0
  --direction <clockwise|counterclockwise>  Angle order in the output. Default: clockwise
  --timestamps <seconds>  Comma-separated timestamp for each angle; overrides even sampling
  --force             Empty the output folder before writing frames
`;

function parseArgs(argv) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      console.log(usage.trim());
      process.exit(0);
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (!arg.startsWith('--')) {
      options.input = arg;
      continue;
    }

    const key = arg.slice(2);
    const value = argv[index + 1];

    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }

    index += 1;

    if (['count', 'quality', 'width', 'start', 'end'].includes(key)) {
      options[key] = Number(value);
    } else if (key === 'start-angle') {
      options.startAngle = Number(value);
    } else {
      options[key] = value;
    }
  }

  return options;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Command failed: ${command}`);
  }

  return result.stdout.trim();
}

function getDuration(inputPath) {
  const ffprobePath = ffprobeStatic.path ?? ffprobeStatic;
  const output = run(ffprobePath, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    inputPath,
  ]);

  const duration = Number(output);

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not read a valid duration from ${inputPath}`);
  }

  return duration;
}

function validateOptions(options) {
  if (!Number.isInteger(options.count) || options.count < 1) {
    throw new Error('--count must be a positive whole number');
  }

  if (!['jpg', 'jpeg', 'png', 'webp'].includes(options.format)) {
    throw new Error('--format must be jpg, png, or webp');
  }

  if (!Number.isFinite(options.width) || options.width < 0) {
    throw new Error('--width must be 0 or a positive number');
  }

  if (!Number.isFinite(options.start) || options.start < 0) {
    throw new Error('--start must be 0 or a positive number');
  }

  if (options.end !== null && (!Number.isFinite(options.end) || options.end <= options.start)) {
    throw new Error('--end must be greater than --start');
  }

  if (!Number.isFinite(options.startAngle)) {
    throw new Error('--start-angle must be a number');
  }

  if (!['clockwise', 'counterclockwise'].includes(options.direction)) {
    throw new Error('--direction must be clockwise or counterclockwise');
  }
}

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

function getTimestamps(options, duration) {
  if (!options.timestamps) {
    const end = options.end ?? duration;
    const usableDuration = end - options.start;

    return Array.from(
      { length: options.count },
      (_, index) => options.start + (usableDuration * index) / options.count,
    );
  }

  const timestamps = options.timestamps.split(',').map(Number);

  if (timestamps.length !== options.count || timestamps.some((timestamp) => !Number.isFinite(timestamp))) {
    throw new Error('--timestamps must contain exactly --count comma-separated numbers');
  }

  if (timestamps.some((timestamp) => timestamp < 0 || timestamp >= duration)) {
    throw new Error(`Each --timestamps value must be within the video (0-${duration.toFixed(3)}s)`);
  }

  if (timestamps.some((timestamp, index) => index > 0 && timestamp <= timestamps[index - 1])) {
    throw new Error('--timestamps values must be in ascending order');
  }

  return timestamps;
}

function frameName(prefix, index, total, format) {
  const digits = Math.max(2, String(total).length);
  return `${prefix}-${String(index + 1).padStart(digits, '0')}.${format === 'jpeg' ? 'jpg' : format}`;
}

function extractFrame({ inputPath, outputDir, outputFile, timestamp, quality, width, crop, format }) {
  const args = [
    '-y',
    '-ss',
    timestamp.toFixed(3),
    '-i',
    inputPath,
    '-frames:v',
    '1',
  ];

  const filters = [];
  if (crop) filters.push(`crop=${crop}`);
  if (width > 0) filters.push(`scale=${width}:-2`);
  if (filters.length > 0) args.push('-vf', filters.join(','));

  if (format !== 'png') {
    args.push('-q:v', String(quality));
  }

  args.push(resolve(outputDir, outputFile));
  run(ffmpegPath, args);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  validateOptions(options);

  const inputPath = resolve(options.input);
  const outputDir = resolve(options.output);
  const duration = getDuration(inputPath);
  const end = options.end ?? duration;

  if (options.start >= duration) {
    throw new Error(`--start must be before the video end (${duration.toFixed(3)}s)`);
  }

  if (end > duration) {
    throw new Error(`--end must not exceed the video duration (${duration.toFixed(3)}s)`);
  }

  const timestamps = getTimestamps(options, duration);

  if (options.force) {
    rmSync(outputDir, { recursive: true, force: true });
  }

  mkdirSync(outputDir, { recursive: true });

  const sourceName = basename(inputPath, extname(inputPath));
  const prefix = options.prefix || sourceName || defaults.prefix;
  const angleDirection = options.direction === 'clockwise' ? 1 : -1;
  const frames = [];

  for (let index = 0; index < options.count; index += 1) {
    const timestamp = timestamps[index];
    const angle = normalizeAngle(options.startAngle + angleDirection * (360 * index) / options.count);
    const outputFile = frameName(prefix, index, options.count, options.format);

    extractFrame({
      inputPath,
      outputDir,
      outputFile,
      timestamp,
      quality: options.quality,
      width: options.width,
      crop: options.crop,
      format: options.format,
    });

    frames.push({ file: outputFile, angle, timestamp });
    console.log(`${String(index + 1).padStart(String(options.count).length, '0')}/${options.count} ${outputFile} @ ${timestamp.toFixed(3)}s = ${angle.toFixed(2)}deg`);
  }

  writeFileSync(resolve(outputDir, 'rotation.json'), `${JSON.stringify({
    source: basename(inputPath),
    start: options.start,
    end,
    direction: options.direction,
    sampling: options.timestamps ? 'calibrated-timestamps' : 'even-time',
    frameCount: options.count,
    degreesPerFrame: 360 / options.count,
    frames,
  }, null, 2)}\n`);

  console.log(`Done. Wrote ${options.count} frames and rotation.json to ${outputDir}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}