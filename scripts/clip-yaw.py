import sys, os, json, math, glob
"""
clip-yaw.py — per-clip facing track for POZR shoot clips.

Usage:
  python3.13 -m venv .venv && .venv/bin/pip install "mediapipe<1" opencv-python-headless numpy
  # sample the clips first (6 fps, 540px wide):
  #   ffmpeg -i clip.mp4 -vf "fps=6,scale=540:-2" -q:v 3 frames/<clip>/f-%03d.jpg
  .venv/bin/python clip-yaw.py <dir with frames/<clip>/f-*.jpg>   → <dir>/yaw.json + strip-<clip>.jpg

Notes (2026-09-04):
  - mediapipe 1.x crashes on macOS in a non-GUI session (Metal service
    unavailable) even on the CPU delegate; 0.10.x runs the pose graph on CPU.
  - The model file pose_landmarker_heavy.task is downloaded on first run.
  - Output convention == the app's: 0 = toward camera, 90 = HER RIGHT side to
    camera (facing viewer-right), 180 = back, 270 = her left side. Verified on
    LA Vintage Nights (car lean 276° faces viewer-left; interior twist ~110°).
  - Store as scene_clips.orientation_track = [{t, deg}, ...]; skip clips where
    the person is mostly out of frame (the strip shows a yaw only on frames
    with a detected pose).
"""
import urllib.request
import numpy as np, cv2
import mediapipe as mp
from mediapipe.tasks import python as mpp
from mediapipe.tasks.python import vision

S = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pose_landmarker_heavy.task')
if not os.path.exists(MODEL):
    urllib.request.urlretrieve('https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task', MODEL)
FPS = 6.0
opts = vision.PoseLandmarkerOptions(
    base_options=mpp.BaseOptions(model_asset_path=MODEL, delegate=mpp.BaseOptions.Delegate.CPU),
    running_mode=vision.RunningMode.IMAGE, num_poses=1,
    min_pose_detection_confidence=0.4, min_pose_presence_confidence=0.4, min_tracking_confidence=0.4)
lm = vision.PoseLandmarker.create_from_options(opts)

def raw_yaw(world):
    """Facing angle from the torso: 0 = toward camera, +90 = facing viewer-right
    (her right side to camera) — app convention. Uses shoulders (11,12) and
    hips (23,24): f = rotate(L-R shoulder vector by +90° in the top-down plane)."""
    L, R = world[11], world[12]; HL, HR = world[23], world[24]
    sx = (L.x - R.x) + (HL.x - HR.x)
    sz = (L.z - R.z) + (HL.z - HR.z)
    # MediaPipe world z: smaller = closer to camera → toward-camera = -z
    # facing f = (-s_c, s_x) with s_c = -sz  →  f = (sz, sx)  →  yaw = atan2(f_x, f_c)
    return (math.degrees(math.atan2(sz, sx)) + 360.0) % 360.0

def circ_median(vals):
    if not vals: return None
    a = np.radians(vals); m = math.degrees(math.atan2(np.median(np.sin(a)), np.median(np.cos(a))))
    return (m + 360.0) % 360.0

out = {}
for clip in sorted(os.listdir(os.path.join(S, 'frames'))):
    files = sorted(glob.glob(os.path.join(S, 'frames', clip, 'f-*.jpg')))
    samples = []
    for i, f in enumerate(files):
        img = mp.Image.create_from_file(f)
        res = lm.detect(img)
        t = round(i / FPS, 3)
        if res.pose_world_landmarks:
            w = res.pose_world_landmarks[0]
            vis = min(w[11].visibility, w[12].visibility, w[23].visibility, w[24].visibility)
            samples.append({'t': t, 'raw': raw_yaw(w), 'vis': round(vis, 2), 'nose': round(w[0].visibility, 2)})
        else:
            samples.append({'t': t, 'raw': None, 'vis': 0, 'nose': 0})
    # circular median smoothing (window 5) over detected samples, then fill gaps by nearest
    vals = [s['raw'] for s in samples]
    sm = []
    for i in range(len(samples)):
        win = [v for v in vals[max(0, i-2):i+3] if v is not None]
        sm.append(circ_median(win))
    last = None
    for i in range(len(sm)):
        if sm[i] is None: sm[i] = last
        else: last = sm[i]
    nxt = None
    for i in range(len(sm)-1, -1, -1):
        if sm[i] is None: sm[i] = nxt
        else: nxt = sm[i]
    track = [{'t': s['t'], 'deg': round(d, 1)} for s, d in zip(samples, sm) if d is not None]
    out[clip] = {'samples': samples, 'track': track}
    det = sum(1 for s in samples if s['raw'] is not None)
    med = circ_median([s['raw'] for s in samples if s['raw'] is not None])
    print(f"clip {clip}: {det}/{len(samples)} frames with a pose, median raw yaw = {med and round(med)}°, "
          f"track = {[d['deg'] for d in track]}")
    # annotated strip for eyeballing: raw yaw printed on each frame
    tiles = []
    for s, f in zip(samples, files):
        im = cv2.imread(f); im = cv2.resize(im, (180, 320))
        txt = f"{s['t']:.2f}s {'' if s['raw'] is None else str(int(round(s['raw'])))+'deg'}"
        cv2.putText(im, txt, (6, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 4)
        cv2.putText(im, txt, (6, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (80, 255, 80), 2)
        tiles.append(im)
    rows = [tiles[i:i+8] for i in range(0, len(tiles), 8)]
    rows = [np.hstack(r + [np.zeros_like(tiles[0])]*(8-len(r))) for r in rows]
    cv2.imwrite(os.path.join(S, f'strip-{clip}.jpg'), np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 80])
json.dump(out, open(os.path.join(S, 'yaw.json'), 'w'), indent=1)
print('saved yaw.json')
