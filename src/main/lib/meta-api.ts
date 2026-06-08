// Meta Graph API client — Facebook Page + Instagram Business Account follower counts.
// Both APIs share the v19+ Graph endpoint and the same access-token model.

import { loadSettings } from "./settings";

const GRAPH = "https://graph.facebook.com/v21.0";

interface MetaApiError {
  error?: { message: string; code: number; type?: string };
}

/** Read Facebook Page follower/fan count. */
export async function getFacebookPageStats(): Promise<{
  followers: number;
  name: string;
}> {
  const { social } = loadSettings();
  const { pageId, pageAccessToken } = social.facebook;
  if (!pageId || !pageAccessToken) {
    throw new Error("Facebook Page ID or access token missing in settings.");
  }
  const url = `${GRAPH}/${encodeURIComponent(pageId)}?fields=name,followers_count,fan_count&access_token=${encodeURIComponent(pageAccessToken)}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as
    | { name?: string; followers_count?: number; fan_count?: number }
    | MetaApiError;
  if ("error" in data && data.error) {
    throw new Error(`Facebook API: ${data.error.message}`);
  }
  const d = data as { name?: string; followers_count?: number; fan_count?: number };
  return {
    followers: d.followers_count ?? d.fan_count ?? 0,
    name: d.name ?? "",
  };
}

/** Read Instagram Business Account follower count. */
export async function getInstagramStats(): Promise<{
  followers: number;
  username: string;
  mediaCount: number;
}> {
  const { social } = loadSettings();
  const { instagramBusinessAccountId, accessToken } = social.instagram;
  if (!instagramBusinessAccountId || !accessToken) {
    throw new Error("Instagram account ID or access token missing in settings.");
  }
  const url = `${GRAPH}/${encodeURIComponent(instagramBusinessAccountId)}?fields=username,followers_count,media_count&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as
    | { username?: string; followers_count?: number; media_count?: number }
    | MetaApiError;
  if ("error" in data && data.error) {
    throw new Error(`Instagram API: ${data.error.message}`);
  }
  const d = data as {
    username?: string;
    followers_count?: number;
    media_count?: number;
  };
  return {
    followers: d.followers_count ?? 0,
    username: d.username ?? "",
    mediaCount: d.media_count ?? 0,
  };
}

export async function testFacebookConnection() {
  try {
    const s = await getFacebookPageStats();
    return { ok: true, message: `Connected. Page "${s.name}" with ${s.followers.toLocaleString()} followers.` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function testInstagramConnection() {
  try {
    const s = await getInstagramStats();
    return {
      ok: true,
      message: `Connected. @${s.username} with ${s.followers.toLocaleString()} followers, ${s.mediaCount} posts.`,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
