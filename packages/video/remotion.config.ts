import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// 9:16 vertical, high bitrate for TikTok/Shorts/Reels (spec §9.8).
Config.setCodec('h264');
Config.setCrf(18);
