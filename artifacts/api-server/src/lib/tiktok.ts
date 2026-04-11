import { logger } from "./logger";

interface TikTokInfo {
  downloadUrl: string;
  musicUrl: string | null;
  title: string | null;
  thumbnailUrl: string | null;
}

export async function fetchTikTokVideo(url: string): Promise<TikTokInfo> {
  const cleanUrl = url.split("?")[0];

  const apiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}&hd=1`;
  logger.info({ url: cleanUrl }, "Fetching TikTok video info");

  const response = await fetch(apiUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`TikTok API request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    code: number;
    msg: string;
    data?: {
      play?: string;
      hdplay?: string;
      wmplay?: string;
      music?: string;
      music_info?: { play?: string };
      title?: string;
      cover?: string;
      images?: string[];
    };
  };

  if (data.code !== 0 || !data.data) {
    throw new Error(data.msg || "Failed to fetch video");
  }

  const videoData = data.data;

  logger.info({
    hdplay: videoData.hdplay ? "present" : "missing",
    play: videoData.play ? "present" : "missing",
    music: videoData.music ? "present" : "missing",
    isSlideshow: !!videoData.images?.length,
  }, "TikTok video data fields");

  // Photo slideshows have images[] but no playable video
  if (videoData.images?.length && !videoData.hdplay && !videoData.play) {
    throw new Error("This TikTok is a photo slideshow — only regular videos can be downloaded.");
  }

  const downloadUrl = videoData.hdplay || videoData.play || "";
  if (!downloadUrl) {
    throw new Error("No download URL available for this video.");
  }

  // If the video URL looks like an audio URL, prefer hdplay
  const musicUrl = videoData.music || videoData.music_info?.play || null;

  // Guard: if video URL is the same as music URL, the API gave us audio instead of video
  if (downloadUrl === musicUrl) {
    logger.warn({ downloadUrl }, "downloadUrl same as musicUrl — possible slideshow or API issue");
    throw new Error("Could not retrieve a video file for this TikTok. It may be a slideshow or audio-only post.");
  }

  return {
    downloadUrl,
    musicUrl: musicUrl || null,
    title: videoData.title ?? null,
    thumbnailUrl: videoData.cover ?? null,
  };
}
