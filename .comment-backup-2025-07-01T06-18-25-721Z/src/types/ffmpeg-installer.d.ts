// Type declarations for ffmpeg installer packages

declare module '@ffmpeg-installer/ffmpeg' {
  interface FFmpegInstaller {
    path: string;
    url: string;
    version: string;
  }
  
  const ffmpegInstaller: FFmpegInstaller;
  export = ffmpegInstaller;
}

declare module '@ffprobe-installer/ffprobe' {
  interface FFprobeInstaller {
    path: string;
    url: string;
    version: string;
  }
  
  const ffprobeInstaller: FFprobeInstaller;
  export = ffprobeInstaller;
}