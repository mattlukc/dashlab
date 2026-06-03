// YouTube Data API v3 — public channel statistics.
// Free tier: 10,000 units/day. A channel stats fetch costs 1 unit.
// Polling every 15 min = 96 units/day. Plenty of headroom.

import { loadSettings } from "./settings";

interface YouTubeChannelStats {
  viewCount: number;
  subscriberCount: number;
  videoCount: number;
}

interface YouTubeApiResponse {
  items?: Array<{
    statistics?: {
      viewCount?: string;
      subscriberCount?: string;
      videoCount?: string;
    };
  }>;
  error?: {
    code: number;
    message: string;
  };
}

/** Fetch public channel statistics for the configured channel. */
export async function getYouTubeChannelStats(): Promise<YouTubeChannelStats> {
  const { social } = loadSettings();
  const { apiKey, channelId } = social.youtube;
  if (!apiKey || !channelId) {
    throw new Error("YouTube API key or channel ID missing in settings.");
  }
  const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as YouTubeApiResponse;
  if (data.error) {
    throw new Error(`YouTube API ${data.error.code}: ${data.error.message}`);
  }
  const stats = data.items?.[0]?.statistics;
  if (!stats) {
    throw new Error(
      "No channel found for that ID. Double-check it starts with 'UC' and is correct."
    );
  }
  return {
    viewCount: parseInt(stats.viewCount ?? "0"),
    subscriberCount: parseInt(stats.subscriberCount ?? "0"),
    videoCount: parseInt(stats.videoCount ?? "0"),
  };
}

export async function testYouTubeConnection(): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const stats = await getYouTubeChannelStats();
    return {
      ok: true,
      message: `Connected. ${stats.subscriberCount.toLocaleString()} subscribers, ${stats.videoCount} videos.`,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
