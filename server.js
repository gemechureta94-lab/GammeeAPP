const express = require("express");
const path = require("path");
const app = express();

const PORT = process.env.PORT || 3000;

const FEEDS = [
  { source: "BBC Afaan Oromoo", group: "oromo_eth", badge: "Afaan Oromoo", url: "https://feeds.bbci.co.uk/afaanoromoo/rss.xml" },
  { source: "OBN (Oromia Broadcasting Network)", group: "oromo_eth", badge: "OBN · Oromia", url: "https://obn.et/feed/" },
  { source: "OMN (Oromia Media Network)", group: "oromo_eth", badge: "OMN · Oromia", url: "https://omntv.org/feed/" },
  { source: "AMN (Amhara Media)", group: "oromo_eth", badge: "AMN · Ethiopia", url: "https://www.amharaweb.com/feed/" },
  { source: "FBC (Fana Broadcasting)", group: "oromo_eth", badge: "FBC · Ethiopia", url: "https://www.fanabc.com/english/feed/" },
  { source: "Walta Media", group: "oromo_eth", badge: "Walta · Ethiopia", url: "https://waltainfo.com/feed/" },
  { source: "Addis Standard", group: "oromo_eth", badge: "Ethiopia", url: "https://addisstandard.com/feed/" },
  { source: "BBC Amharic", group: "oromo_eth", badge: "Amharic", url: "https://feeds.bbci.co.uk/amharic/rss.xml" },
  { source: "BBC News (World)", group: "global", badge: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { source: "Al Jazeera", group: "global", badge: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" }
];

let cachedNews = { updatedAt: 0, items: [] };

function cleanText(raw = "") {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(block, tagNames) {
  for (const tag of tagNames) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    const match = block.match(regex);
    if (match && match[1]) return match[1].trim();
  }
  return "";
}

function extractLink(block) {
  const linkTag = extractTag(block, ["link"]);
  const cleaned = cleanText(linkTag);
  if (cleaned && cleaned.startsWith("http")) return cleaned;
  const hrefMatch = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return hrefMatch ? hrefMatch[1].trim() : "#";
}

function parseRssOrAtom(xml, feed) {
  const blocks = [...xml.matchAll(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi)].map(m => m[0]).slice(0, 8);
  return blocks.map((block, idx) => {
    const title = cleanText(extractTag(block, ["title"])) || "News Update";
    const descFull = cleanText(extractTag(block, ["description", "summary", "content:encoded", "content"]));
    const summary = descFull.length > 260 ? descFull.slice(0, 260) + "..." : descFull;
    const link = extractLink(block);
    const pubDate = cleanText(extractTag(block, ["pubDate", "published", "updated"])) || "Latest";
    const parsedTime = Date.parse(pubDate);
    return {
      id: `news-${feed.source}-${idx}-${encodeURIComponent(title)}`,
      isNews: true,
      group: feed.group,
      badge: feed.badge,
      sourceName: feed.source,
      title,
      summary,
      link,
      pubDate,
      sortTime: Number.isNaN(parsedTime) ? Date.now() - idx * 1000 : parsedTime
    };
  });
}

async function fetchAllFeeds() {
  const now = Date.now();
  if (cachedNews.items.length > 0 && now - cachedNews.updatedAt < 4 * 60 * 1000) {
    return cachedNews.items;
  }

  const results = await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);
        const res = await fetch(feed.url, {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 GammeeAPP-NewsBot/1.0" }
        });
        clearTimeout(timeout);
        if (!res.ok) return [];
        const xml = await res.text();
        return parseRssOrAtom(xml, feed);
      } catch (_) {
        return [];
      }
    })
  );

  const merged = results.flat().sort((a, b) => b.sortTime - a.sortTime);
  if (merged.length > 0) {
    cachedNews = { updatedAt: now, items: merged };
  }
  return cachedNews.items;
}

app.get("/api/news", async (req, res) => {
  try {
    const items = await fetchAllFeeds();
    res.json({ ok: true, count: items.length, items });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, items: [] });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Gammee APP running on port ${PORT}`);
});
