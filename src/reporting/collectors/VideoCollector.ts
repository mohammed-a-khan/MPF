// src/reporting/collectors/VideoCollector.ts

import { BrowserContext } from 'playwright';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import {
  CollectorOptions
} from '../types/reporting.types';
import * as path from 'path';
import * as fs from 'fs';
const ffmpeg = require('fluent-ffmpeg');
import * as ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import * as ffprobeInstaller from '@ffprobe-installer/ffprobe';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

interface VideoEvidence {
  id: string;
  type: string;
  timestamp: Date;
  scenarioId: string;
  name: string;
  description: string;
  path: string;
  size: number;
  duration: number;
  metadata: VideoMetadata;
  thumbnail: string | null;
  tags: string[];
  format: string;
}

interface VideoOptions {
  size?: { width: number; height: number };
  quality?: string;
  format?: string;
  compress?: boolean;
  description?: string;
  tags?: string[];
}

interface VideoMetadata {
  duration: number;
  dimensions: { width: number; height: number };
  fps: number;
  codec: string;
  bitrate: number;
  format?: string;
  size?: number;
  hasAudio?: boolean;
  startTime?: Date;
  endTime?: Date;
  compressed?: boolean;
  originalSize?: number;
}

export class VideoCollector {
  private static instance: VideoCollector;
  private readonly logger = Logger.getInstance(VideoCollector.name);
  
  private readonly videos: Map<string, VideoEvidence[]> = new Map();
  private readonly activeRecordings: Map<string, {
    context: BrowserContext;
    startTime: Date;
    options: VideoOptions;
  }> = new Map();
  
  private readonly recordVideos: boolean;
  private readonly videoQuality: string;
  private readonly videoSize: { width: number; height: number };
  private readonly videoPath: string;
  private readonly maxVideoDuration: number;
  private readonly compressVideos: boolean;
  private readonly keepOriginals: boolean;
  
  private executionId: string = '';
  private videoCount: number = 0;

  private constructor() {
    this.recordVideos = ConfigurationManager.getBoolean('RECORD_VIDEOS', false);
    this.videoQuality = ConfigurationManager.get('VIDEO_QUALITY', 'medium');
    this.videoSize = {
      width: ConfigurationManager.getInt('VIDEO_WIDTH', 1280),
      height: ConfigurationManager.getInt('VIDEO_HEIGHT', 720)
    };
    this.videoPath = ConfigurationManager.get('VIDEO_PATH', './evidence/videos');
    this.maxVideoDuration = ConfigurationManager.getInt('MAX_VIDEO_DURATION_SECONDS', 300);
    this.compressVideos = ConfigurationManager.getBoolean('COMPRESS_VIDEOS', true);
    this.keepOriginals = ConfigurationManager.getBoolean('KEEP_ORIGINAL_VIDEOS', false);
  }

  static getInstance(): VideoCollector {
    if (!VideoCollector.instance) {
      VideoCollector.instance = new VideoCollector();
    }
    return VideoCollector.instance;
  }

  async initialize(executionId: string, _options?: CollectorOptions): Promise<void> {
    this.executionId = executionId;
    this.videoCount = 0;
    this.videos.clear();
    this.activeRecordings.clear();
    
    // Note: options parameter is reserved for future extensions
    if (!fs.existsSync(this.videoPath)) {
      fs.mkdirSync(this.videoPath, { recursive: true });
    }
    
    ActionLogger.logCollectorInitialization('video', executionId);
  }

  async startRecording(
    scenarioId: string,
    context: BrowserContext,
    options: VideoOptions = {}
  ): Promise<void> {
    if (!this.recordVideos) {
      return;
    }
    
    try {
      const videoDir = path.join(this.videoPath, this.executionId);
      if (!fs.existsSync(videoDir)) {
        fs.mkdirSync(videoDir, { recursive: true });
      }
      
      const videoConfig = {
        dir: videoDir,
        size: options.size || this.videoSize
      };
      
      if (!fs.existsSync(videoConfig.dir)) {
        fs.mkdirSync(videoConfig.dir, { recursive: true });
      }
      
      const pages = context.pages();
      for (const page of pages) {
        await page.video()?.delete().catch(() => {});
      }
      
      this.activeRecordings.set(scenarioId, {
        context,
        startTime: new Date(),
        options: {
          ...options,
          quality: options.quality || this.videoQuality,
          format: options.format || 'webm'
        }
      });
      
      ActionLogger.logVideoRecording('start', scenarioId);
      
    } catch (error) {
      this.logger.error(`Failed to start video recording for ${scenarioId}`, error as Error);
    }
  }

  async stopRecording(scenarioId: string): Promise<VideoEvidence | null> {
    if (!this.recordVideos) {
      return null;
    }
    
    const recording = this.activeRecordings.get(scenarioId);
    if (!recording) {
      return null;
    }
    
    try {
      const { context, startTime, options } = recording;
      const duration = Date.now() - startTime.getTime();
      
      const pages = context.pages();
      if (pages.length === 0) {
        return null;
      }
      
      const page = pages[0];
      if (!page) {
        return null;
      }
      
      const video = page.video();
      if (!video) {
        return null;
      }
      
      const videoFileName = `${scenarioId}_${startTime.getTime()}.webm`;
      const videoPath = path.join(this.videoPath, this.executionId, videoFileName);
      await video.saveAs(videoPath);
      await video.delete();
      
      const stats = await fs.promises.stat(videoPath);
      
      let processedPath = videoPath;
      let processedSize = stats.size;
      
      if (this.compressVideos || options.compress) {
        const compressed = await this.compressVideo(videoPath, options);
        if (compressed) {
          processedPath = compressed.path;
          processedSize = compressed.size;
          
          if (!this.keepOriginals) {
            await fs.promises.unlink(videoPath);
          }
        }
      }
      
      const metadata = await this.extractVideoMetadata(processedPath);
      
      const thumbnail = await this.generateVideoThumbnail(processedPath);
      
      const evidence: VideoEvidence = {
        id: `video_${this.executionId}_${this.videoCount}`,
        type: 'video',
        timestamp: new Date(),
        scenarioId,
        name: `${scenarioId}_recording`,
        description: options.description || `Video recording of scenario ${scenarioId}`,
        path: processedPath,
        size: processedSize,
        duration,
        metadata: {
          ...metadata,
          startTime,
          endTime: new Date(),
          compressed: processedPath !== videoPath,
          originalSize: stats.size
        },
        thumbnail: thumbnail ? thumbnail.toString('base64') : null,
        tags: options.tags || ['recording'],
        format: path.extname(processedPath).substring(1)
      };
      
      if (!this.videos.has(scenarioId)) {
        this.videos.set(scenarioId, []);
      }
      this.videos.get(scenarioId)!.push(evidence);
      
      this.videoCount++;
      this.activeRecordings.delete(scenarioId);
      
      ActionLogger.logVideoRecording('stop', scenarioId, duration, processedSize);
      
      return evidence;
      
    } catch (error) {
      this.logger.error(`Failed to stop video recording for ${scenarioId}`, error as Error);
      this.activeRecordings.delete(scenarioId);
      return null;
    }
  }

  async collectForScenario(
    scenarioId: string,
    scenarioName: string
  ): Promise<VideoEvidence[]> {
    if (this.activeRecordings.has(scenarioId)) {
      const video = await this.stopRecording(scenarioId);
      if (video) {
        video.name = scenarioName || video.name;
        video.description = `Video recording of scenario: ${scenarioName}`;
        return [video];
      }
    }
    
    const existingVideos = this.videos.get(scenarioId) || [];
    if (scenarioName && existingVideos.length > 0) {
      existingVideos.forEach(video => {
        if (!video.name || video.name === `${scenarioId}_recording`) {
          video.name = scenarioName;
          video.description = `Video recording of scenario: ${scenarioName}`;
        }
      });
    }
    
    return existingVideos;
  }

  private async compressVideo(
    inputPath: string,
    options: VideoOptions
  ): Promise<{ path: string; size: number } | null> {
    return new Promise((resolve) => {
      const outputPath = inputPath.replace(/\.(webm|mp4)$/, '_compressed.mp4');
      
      const command = ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',
          '-preset fast',
          '-crf 28',
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart'
        ]);
      
      if (options.size) {
        command.size(`${options.size.width}x${options.size.height}`);
      }
      
      if (this.maxVideoDuration > 0) {
        command.duration(this.maxVideoDuration);
      }
      
      command
        .on('start', (cmdline: string) => {
          this.logger.debug('Starting video compression:', { cmdline });
        })
        .on('progress', (progress: any) => {
          this.logger.debug('Compression progress', { percent: progress.percent });
        })
        .on('end', async () => {
          try {
            const stats = await fs.promises.stat(outputPath);
            resolve({ path: outputPath, size: stats.size });
          } catch (error) {
            resolve(null);
          }
        })
        .on('error', (err: Error) => {
          this.logger.error('Video compression failed:', err);
          resolve(null);
        })
        .save(outputPath);
    });
  }

  private async extractVideoMetadata(videoPath: string): Promise<VideoMetadata> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(videoPath, (err: Error | null, metadata: any) => {
        if (err) {
          this.logger.error('Failed to extract video metadata:', err);
          resolve({
            duration: 0,
            dimensions: { width: 0, height: 0 },
            fps: 0,
            codec: 'unknown',
            bitrate: 0
          });
          return;
        }
        
        const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
        const audioStream = metadata.streams.find((s: any) => s.codec_type === 'audio');
        
        resolve({
          duration: Math.floor(metadata.format.duration || 0),
          dimensions: {
            width: videoStream?.width || 0,
            height: videoStream?.height || 0
          },
          fps: videoStream ? eval(videoStream.r_frame_rate) : 0,
          codec: videoStream?.codec_name || 'unknown',
          bitrate: parseInt(metadata.format.bit_rate || '0'),
          format: metadata.format.format_name || 'unknown',
          size: parseInt(metadata.format.size || '0'),
          hasAudio: !!audioStream
        });
      });
    });
  }

  private async generateVideoThumbnail(videoPath: string): Promise<Buffer | null> {
    return new Promise((resolve) => {
      const tempPath = path.join(
        this.videoPath,
        `thumb_${Date.now()}.png`
      );
      
      ffmpeg(videoPath)
        .screenshots({
          timestamps: ['10%'],
          filename: path.basename(tempPath),
          folder: path.dirname(tempPath),
          size: '320x240'
        })
        .on('end', async () => {
          try {
            const thumbnail = await fs.promises.readFile(tempPath);
            await fs.promises.unlink(tempPath);
            resolve(thumbnail);
          } catch (error) {
            resolve(null);
          }
        })
        .on('error', (err: Error) => {
          this.logger.debug('Thumbnail generation failed:', { error: err.message });
          resolve(null);
        });
    });
  }

  async mergeVideos(
    videoPaths: string[],
    outputPath: string
  ): Promise<VideoEvidence | null> {
    return new Promise((resolve) => {
      const command = ffmpeg();
      
      videoPaths.forEach(path => {
        command.input(path);
      });
      
      command
        .on('start', (cmdline: string) => {
          this.logger.debug('Starting video merge:', { cmdline });
        })
        .on('end', async () => {
          try {
            const stats = await fs.promises.stat(outputPath);
            const metadata = await this.extractVideoMetadata(outputPath);
            const thumbnail = await this.generateVideoThumbnail(outputPath);
            
            const evidence: VideoEvidence = {
              id: `video_merged_${Date.now()}`,
              type: 'video',
              timestamp: new Date(),
              scenarioId: 'merged',
              name: 'Merged Video',
              description: `Merged ${videoPaths.length} video clips`,
              path: outputPath,
              size: stats.size,
              duration: metadata.duration * 1000,
              metadata,
              thumbnail: thumbnail ? thumbnail.toString('base64') : null,
              tags: ['merged'],
              format: 'mp4'
            };
            
            resolve(evidence);
          } catch (error) {
            resolve(null);
          }
        })
        .on('error', (err: Error) => {
          this.logger.error('Video merge failed:', err);
          resolve(null);
        })
        .mergeToFile(outputPath, './temp/');
    });
  }

  async extractSegment(
    videoPath: string,
    startTime: number,
    duration: number,
    outputPath: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      ffmpeg(videoPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .output(outputPath)
        .on('end', () => resolve(true))
        .on('error', () => resolve(false))
        .run();
    });
  }

  async addWatermark(
    videoPath: string,
    watermarkText: string,
    outputPath: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      ffmpeg(videoPath)
        .videoFilters([
          `drawtext=text='${watermarkText}':fontsize=20:fontcolor=white:x=10:y=10:shadowcolor=black:shadowx=2:shadowy=2`
        ])
        .on('end', () => resolve(true))
        .on('error', () => resolve(false))
        .save(outputPath);
    });
  }

  async convertFormat(
    videoPath: string,
    targetFormat: 'mp4' | 'webm' | 'avi',
    outputPath: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const command = ffmpeg(videoPath);
      
      switch (targetFormat) {
        case 'mp4':
          command.outputOptions(['-c:v libx264', '-c:a aac']);
          break;
        case 'webm':
          command.outputOptions(['-c:v libvpx', '-c:a libvorbis']);
          break;
        case 'avi':
          command.outputOptions(['-c:v mpeg4', '-c:a mp3']);
          break;
      }
      
      command
        .on('end', () => resolve(true))
        .on('error', () => resolve(false))
        .save(outputPath);
    });
  }

  getStatistics(): {
    totalRecorded: number;
    totalSize: number;
    totalDuration: number;
    averageSize: number;
    averageDuration: number;
    byScenario: Record<string, {
      count: number;
      totalSize: number;
      totalDuration: number;
    }>;
  } {
    let totalSize = 0;
    let totalDuration = 0;
    const byScenario: Record<string, any> = {};
    
    this.videos.forEach((videos, scenarioId) => {
      let scenarioSize = 0;
      let scenarioDuration = 0;
      
      videos.forEach(video => {
        totalSize += video.size;
        totalDuration += video.duration;
        scenarioSize += video.size;
        scenarioDuration += video.duration;
      });
      
      byScenario[scenarioId] = {
        count: videos.length,
        totalSize: scenarioSize,
        totalDuration: scenarioDuration
      };
    });
    
    return {
      totalRecorded: this.videoCount,
      totalSize,
      totalDuration,
      averageSize: this.videoCount > 0 ? totalSize / this.videoCount : 0,
      averageDuration: this.videoCount > 0 ? totalDuration / this.videoCount : 0,
      byScenario
    };
  }

  async cleanupOldVideos(retentionDays: number = 7): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      const videoDirs = await fs.promises.readdir(this.videoPath);
      
      for (const dir of videoDirs) {
        const dirPath = path.join(this.videoPath, dir);
        const stats = await fs.promises.stat(dirPath);
        
        if (stats.isDirectory() && stats.mtime < cutoffDate) {
          await fs.promises.rm(dirPath, { recursive: true, force: true });
          this.logger.info(`Cleaned up old video directory: ${dir}`);
        }
      }
    } catch (error) {
      this.logger.error('Failed to clean up old videos', error as Error);
    }
  }

  async finalize(executionId: string): Promise<void> {
    const activeScenarios = Array.from(this.activeRecordings.keys());
    for (const scenarioId of activeScenarios) {
      await this.stopRecording(scenarioId);
    }
    
    this.videos.clear();
    this.activeRecordings.clear();
    
    const stats = this.getStatistics();
    ActionLogger.logCollectorFinalization('video', executionId, stats);
  }
}
