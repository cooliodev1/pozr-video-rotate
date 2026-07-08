import { mkdirSync, rmSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const defaults = {
  input: 'input.mp4',
  output: 'public/frames',
  count: 24,
  format: 'jpg',
  quality: 3,
  prefix: 'frame',
  width: 960,
  start: 0,
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
  --start <seconds>   Skip this many seconds before sampling. Default: 0
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

    if (['count', 'quality', 'width', 'start'].includes(key)) {
      options[key] = Number(value);
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
}

function frameName(prefix, index, total, format) {
  const digits = Math.max(2, String(total).length);
  return `${prefix}-${String(index + 1).padStart(digits, '0')}.${format === 'jpeg' ? 'jpg' : format}`;
}

function extractFrame({ inputPath, outputDir, outputFile, timestamp, quality, width, format }) {
  const args = [
    '-y',
    '-ss',
    timestamp.toFixed(3),
    '-i',
    inputPath,
    '-frames:v',
    '1',
  ];

  if (width > 0) {
    args.push('-vf', `scale=${width}:-1`);
  }

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
  const start = Math.min(options.start, Math.max(duration - 0.001, 0));
  const usableDuration = Math.max(duration - start, 0.001);

  if (options.force) {
    rmSync(outputDir, { recursive: true, force: true });
  }

  mkdirSync(outputDir, { recursive: true });

  const sourceName = basename(inputPath, extname(inputPath));
  const prefix = options.prefix || sourceName || defaults.prefix;

  for (let index = 0; index < options.count; index += 1) {
    const timestamp = start + (usableDuration * index) / options.count;
    const outputFile = frameName(prefix, index, options.count, options.format);

    extractFrame({
      inputPath,
      outputDir,
      outputFile,
      timestamp,
      quality: options.quality,
      width: options.width,
      format: options.format,
    });

    console.log(`${String(index + 1).padStart(String(options.count).length, '0')}/${options.count} ${outputFile} @ ${timestamp.toFixed(3)}s`);
  }

  console.log(`Done. Wrote ${options.count} frames to ${outputDir}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}