// Video, audio and subtitles through FFmpeg.
const path = require('path');
const { ffmpeg } = require('./common.cjs');

const EVEN = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
const H264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'];
const ARGS = {
  MP4: ['-vf', EVEN, ...H264, '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'],
  MOV: ['-vf', EVEN, ...H264, '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'],
  MKV: ['-vf', EVEN, ...H264, '-c:a', 'aac', '-b:a', '160k'],
  WEBM: ['-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-c:a', 'libopus'],
  AVI: ['-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'libmp3lame', '-q:a', '4'],
  WMV: ['-vf', EVEN, '-c:v', 'wmv2', '-b:v', '3M', '-c:a', 'wmav2', '-b:a', '160k'],
  MPG: ['-vf', EVEN, '-c:v', 'mpeg2video', '-q:v', '4', '-c:a', 'mp2', '-b:a', '192k'],
  FLV: ['-vf', EVEN, '-c:v', 'flv1', '-q:v', '4', '-c:a', 'libmp3lame', '-ar', '44100'],
  GIF: ['-vf', 'fps=12,scale=480:-2:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse', '-an'],
  MP3: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'],
  WAV: ['-vn', '-c:a', 'pcm_s16le'],
  M4A: ['-vn', '-c:a', 'aac', '-b:a', '192k'],
  AAC: ['-vn', '-c:a', 'aac', '-b:a', '192k'],
  FLAC: ['-vn', '-c:a', 'flac'],
  OGG: ['-vn', '-c:a', 'libopus', '-b:a', '128k'],
  OPUS: ['-vn', '-c:a', 'libopus', '-b:a', '128k'],
  AIFF: ['-vn', '-c:a', 'pcm_s16be'],
  WMA: ['-vn', '-c:a', 'wmav2', '-b:a', '192k'],
  AC3: ['-vn', '-c:a', 'ac3', '-b:a', '384k'],
  // subtitles: FFmpeg picks the writer from the extension
  SRT: [], VTT: [], ASS: [], LRC: [],
};

function argsFor(T,options={}){
  const args=[...(ARGS[T]||[])],crf={small:30,balanced:23,best:18}[options.video]||23;
  const replace=(flag,value)=>{const i=args.indexOf(flag);if(i>=0)args[i+1]=value;};
  if(['MP4','MOV','MKV'].includes(T)){replace('-crf',String(crf));if(options.video==='best')replace('-preset','slow');} // slow: same quality in a smaller file
  if(T==='WEBM')replace('-crf',String(crf+10));
  if(options.video)replace('-b:v',({small:'1M',balanced:'3M',best:'6M'})[options.video]);
  if(['AVI','MPG','FLV'].includes(T)&&options.video)replace('-q:v',String(({small:8,balanced:4,best:2})[options.video]));
  if(['1080','720'].includes(options.resolution)&&!args.includes('-vn')&&!['GIF','SRT','VTT','ASS','LRC'].includes(T)){
    const height=options.resolution,filter=`scale=-2:'min(${height},ih)'`,i=args.indexOf('-vf');if(i>=0)args[i+1]=`${filter},${args[i+1]}`;else args.unshift('-vf',filter);
  }
  if(options.audio&& !['WAV','AIFF','FLAC'].includes(T)&&!['SRT','VTT','ASS','LRC','GIF'].includes(T)){
    const q=args.indexOf('-q:a');if(q>=0)args.splice(q,2);
    const i=args.indexOf('-b:a');if(i>=0)args[i+1]=`${options.audio}k`;else args.push('-b:a',`${options.audio}k`);
  }
  return args;
}
const convert = (input, T, out, onProgress,options,edit={}) => ffmpeg([...(edit.trim?['-ss',String(edit.trim.start)]:[]),'-i', input,...(edit.trim?['-t',String(edit.trim.end-edit.trim.start)]:[]), ...argsFor(T,options), out], onProgress);

// Tools. Returns { ext, dir?, run(out) }: the extension to allocate (or a folder) and the job.
function tool(input, pick, kind, onProgress) {
  const own = path.extname(input).slice(1).toLowerCase();
  if (kind === 'audio') {
    if (pick === 'NORM') return { ext: own, run: out => ffmpeg(['-i', input, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-vn', out], onProgress) };
    return { ext: 'mp3', run: out => ffmpeg(['-i', input, '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', out], onProgress) };
  }
  if (pick === 'MUTE') return { ext: own, run: out => ffmpeg(['-i', input, '-map', '0:v', '-c', 'copy', out], onProgress) }; // picture untouched
  if (pick === 'THMB') return { ext: 'jpg', run: out => ffmpeg(['-i', input, '-vf', "thumbnail=300,scale='min(1920,iw)':-2", '-frames:v', '1', '-q:v', '3', out]) };
  if (pick === 'FRMS') return { dir: true, run: out => ffmpeg(['-i', input, '-vf', 'fps=1', path.join(out, 'frame-%04d.png')], onProgress) };
  const vf = { ROT: `transpose=1,${EVEN}`, MINI: `scale='min(1280,iw)':-2,${EVEN}`, GRAY: `hue=s=0,${EVEN}`, '720P': `scale=-2:'min(720,ih)',${EVEN}` }[pick];
  return { ext: 'mp4', run: out => ffmpeg(['-i', input, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', pick === 'MINI' ? '30' : '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', pick === 'MINI' ? '96k' : '160k', '-movflags', '+faststart', out], onProgress) };
}

module.exports = { convert, tool, ARGS,argsFor };
