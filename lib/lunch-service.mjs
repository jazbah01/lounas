import { restaurants } from "../config/restaurants.mjs";

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const FINNISH_DAYS = {
  monday: "maanantai",
  tuesday: "tiistai",
  wednesday: "keskiviikko",
  thursday: "torstai",
  friday: "perjantai"
};

export async function getLunchData(now = new Date()) {
  const dayKey = getDayKey(now);
  const formattedDate = formatFinnishDate(now);

  if (dayKey === "saturday" || dayKey === "sunday") {
    return {
      date: formattedDate,
      dayKey,
      isWeekend: true,
      restaurants: restaurants.map((restaurant) => ({
        id: restaurant.id,
        name: restaurant.name,
        url: restaurant.url,
        items: [],
        error: "Lounaslistoja haetaan vain arkipäivisin."
      }))
    };
  }

  const results = await Promise.all(
    restaurants.map(async (restaurant) => {
      try {
        const html = await fetchHtml(restaurant.url);
        const items = parseRestaurantMenu(restaurant.parser, html, now);

        if (!items.length) {
          throw new Error("Tämän päivän lounasta ei löytynyt sivulta.");
        }

        return {
          id: restaurant.id,
          name: restaurant.name,
          url: restaurant.url,
          items,
          error: null
        };
      } catch (error) {
        return {
          id: restaurant.id,
          name: restaurant.name,
          url: restaurant.url,
          items: [],
          error: error instanceof Error ? error.message : "Tuntematon virhe."
        };
      }
    })
  );

  return {
    date: formattedDate,
    dayKey,
    isWeekend: false,
    restaurants: results
  };
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "LunchApp/1.0 (+https://localhost)"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Lähdesivu vastasi virhekoodilla ${response.status}.`);
    }

    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Haku aikakatkaistiin.");
    }

    if (error instanceof Error && error.cause && typeof error.cause === "object") {
      const cause = error.cause;
      if ("code" in cause && cause.code === "ENOTFOUND") {
        throw new Error("Osoitetta ei löytynyt DNS:stä.");
      }
      if ("code" in cause && cause.code === "ECONNREFUSED") {
        throw new Error("Yhteys kohdesivuun estettiin.");
      }
    }

    if (error instanceof Error && error.message === "fetch failed") {
      throw new Error("Yhteys ravintolan sivulle epäonnistui.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseRestaurantMenu(parser, html, now) {
  switch (parser) {
    case "patakunkku":
      return parseWeeklyDaySections(html, now, {
        sectionStart: "Nekalan PataKunkun lounas",
        dayPatterns: {
          monday: "Maanantai",
          tuesday: "Tiistai",
          wednesday: "Keskiviikko",
          thursday: "Torstai",
          friday: "Perjantai"
        },
        stopTokens: ["L-laktoositon", "Lounaan hinnat:"]
      });
    case "nekalanhovi":
      return parseNekalanhovi(html, now);
    case "aleksis":
      return parseAleksis(html, now);
    case "zafran":
      return parseZafran(html, now);
    case "evas":
      return parseEvas(html, now);
    case "stahlberg":
      return parseStahlberg(html, now);
    default:
      throw new Error("Parseria ei ole määritelty.");
  }
}

function parseWeeklyDaySections(html, now, options) {
  const section = extractSection(html, options.sectionStart);
  const normalized = normalizeWhitespace(stripHtml(section));
  const text = removeSoftHyphens(normalized);
  const dayKey = getDayKey(now);
  const blocks = splitByDays(text, options.dayPatterns);
  const block = blocks[dayKey];

  if (!block) {
    return [];
  }

  const cleaned = truncateAtStops(block, options.stopTokens);

  return cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\d+[.,]?\d*\s*€/.test(line));
}

function parseHeadingBlocks(html, now, headingRegex, options = {}) {
  const matches = Array.from(html.matchAll(headingRegex));
  const dayName = capitalize(FINNISH_DAYS[getDayKey(now)]);

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (!match[0].includes(dayName)) {
      continue;
    }

    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : html.length;
    const rawBlock = html.slice(start, end);
    const text = normalizeWhitespace(stripHtml(rawBlock));
    const lines = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !options.itemStopPatterns?.some((pattern) => pattern.test(line)));

    return dedupeLines(lines);
  }

  return [];
}

function parseAleksis(html, now) {
  const blocks = Array.from(html.matchAll(/<div class="paiva">([\s\S]*?)<div class="lunch">/gi));
  const dayName = capitalize(FINNISH_DAYS[getDayKey(now)]);

  for (const [, block] of blocks) {
    const headingMatch = block.match(/<h4>([^<]+)<\/h4>/i);
    const contentMatch = block.match(/<div class="lounas">([\s\S]*)$/i);

    if (!headingMatch || !contentMatch) {
      continue;
    }

    const heading = headingMatch[1];
    const content = contentMatch[1];

    if (!heading.includes(dayName)) {
      continue;
    }

    const items = Array.from(content.matchAll(/<li\b[^>]*>([\s\S]*?)(?=<\/li>|<li\b|<\/ul>)/gi))
      .flatMap((match) => parsePossiblyBrokenAleksisItem(match[1]));

    return dedupeLines(items);
  }

  return [];
}

function parsePossiblyBrokenAleksisItem(rawLiHtml) {
  return normalizeWhitespace(stripHtml(rawLiHtml))
    .split(/\n+/)
    .flatMap((line) => splitOnLikelyAllergenBoundary(line.trim()))
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitOnLikelyAllergenBoundary(line) {
  return line
    .replace(
      /(\((?:[A-Z]{1,4}(?:,\s*[A-Z]{1,4})*)\)|(?:[A-Z]{1,4}(?:,\s*[A-Z]{1,4})*))\s+(?=[A-ZÅÄÖ])/g,
      "$1\n"
    )
    .split(/\n+/);
}

function parseNekalanhovi(html, now) {
  const dayName = capitalize(FINNISH_DAYS[getDayKey(now)]);
  const pattern = new RegExp(
    `<h3[^>]*>${dayName}[^<]*<\\/h3>[\\s\\S]*?<div class="elementor-widget-container">([\\s\\S]*?)<\\/div>[\\s\\S]*?<h3[^>]*>Hinta<\\/h3>`,
    "i"
  );
  const match = html.match(pattern);

  if (!match) {
    return [];
  }

  const block = match[1]
    .replace(/<span[^>]*> *<\/span>\s*<br[^>]*>/gi, "\n")
    .replace(/<br[^>]*>/gi, "\n");

  return block
    .split(/\n+/)
    .map((line) => normalizeWhitespace(stripHtml(line)))
    .filter(Boolean);
}

function parseZafran(html, now) {
  const section = extractSection(html, "Viikon");
  const text = normalizeWhitespace(stripHtml(section));
  const dayKey = getDayKey(now);
  const abbreviations = {
    monday: "Ma:",
    tuesday: "Ti:",
    wednesday: "Ke:",
    thursday: "To:",
    friday: "Pe:"
  };
  const dayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const currentIndex = dayOrder.indexOf(dayKey);

  if (currentIndex === -1) {
    return [];
  }

  const startToken = abbreviations[dayKey];
  const endToken = currentIndex + 1 < dayOrder.length ? abbreviations[dayOrder[currentIndex + 1]] : "Lounaaseen sis.";
  const startIndex = text.indexOf(startToken);
  const endIndex = text.indexOf(endToken);

  if (startIndex === -1) {
    return [];
  }

  const block = text.slice(startIndex + startToken.length, endIndex === -1 ? text.length : endIndex);

  return block
    .split(/\n+/)
    .flatMap((line) => line.split(/<br\s*\/?>/i))
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => line.split(/\s{2,}/))
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseEvas(html, now) {
  const text = normalizeWhitespace(stripHtml(extractSection(html, "Kotiruokalounas")));
  const dayKey = getDayKey(now);
  const tokens = {
    monday: "Ma",
    tuesday: "Ti",
    wednesday: "Ke",
    thursday: "To",
    friday: "Pe"
  };
  const dayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const currentIndex = dayOrder.indexOf(dayKey);

  if (currentIndex === -1) {
    return [];
  }

  const startToken = tokens[dayKey];
  const nextToken = currentIndex + 1 < dayOrder.length ? tokens[dayOrder[currentIndex + 1]] : "Tampereen paras intialainen";
  const pattern = new RegExp(
    `${startToken}\\s+\\d{1,2}\\.\\d{1,2}(.*?)${currentIndex + 1 < dayOrder.length ? `(?=${nextToken}\\s+\\d{1,2}\\.\\d{1,2})` : `(?=${nextToken})`}`,
    "si"
  );
  const match = text.match(pattern);

  if (!match) {
    return [];
  }

  return match[1]
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(Kotiruokalounas|Eläkeläiset|Lapset|Ylijäämäruoka)/i.test(line));
}

function parseStahlberg(html, now) {
  const dayKey = getDayKey(now);
  const dayConfig = {
    monday: { heading: "Maanantai", tableId: "151" },
    tuesday: { heading: "Tiistai", tableId: "152" },
    wednesday: { heading: "Keskiviikko", tableId: "153" },
    thursday: { heading: "Torstai", tableId: "154" },
    friday: { heading: "Perjantai", tableId: "156" }
  }[dayKey];

  if (!dayConfig) {
    return [];
  }

  const sectionPattern = new RegExp(
    `<h3>${dayConfig.heading}[^<]*<\\/h3>[\\s\\S]*?<table id="tablepress-${dayConfig.tableId}"[^>]*>([\\s\\S]*?)<\\/table>`,
    "i"
  );
  const match = html.match(sectionPattern);

  if (!match) {
    return [];
  }

  return Array.from(match[1].matchAll(/<td class="column-1">([\s\S]*?)<\/td>/gi))
    .map((row) => normalizeWhitespace(stripHtml(row[1])))
    .filter(Boolean);
}

function extractSection(html, startToken) {
  const startIndex = html.indexOf(startToken);
  if (startIndex === -1) {
    throw new Error("Sivulta ei löytynyt lounasosiota.");
  }

  return html.slice(startIndex);
}

function splitByDays(text, dayPatterns) {
  const keys = Object.keys(dayPatterns);
  const result = {};

  for (let index = 0; index < keys.length; index += 1) {
    const dayKey = keys[index];
    const dayPattern = dayPatterns[dayKey];
    const nextPattern = index + 1 < keys.length ? dayPatterns[keys[index + 1]] : null;
    const regex = new RegExp(
      `${dayPattern}\\s+\\d{1,2}\\.\\d{1,2}\\.(.*?)${nextPattern ? `(?=${nextPattern}\\s+\\d{1,2}\\.\\d{1,2}\\.)` : "$"}`,
      "si"
    );
    const match = text.match(regex);

    if (match) {
      result[dayKey] = match[1].trim();
    }
  }

  return result;
}

function truncateAtStops(text, stopTokens = []) {
  let truncated = text;

  for (const token of stopTokens) {
    const index = truncated.indexOf(token);
    if (index !== -1) {
      truncated = truncated.slice(0, index);
    }
  }

  return truncated;
}

function stripHtml(input) {
  return decodeHtmlEntities(
    input
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  );
}

function decodeHtmlEntities(input) {
  return input
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "'")
    .replace(/&#038;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&auml;/g, "ä")
    .replace(/&Auml;/g, "Ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&aring;/g, "å")
    .replace(/&Aring;/g, "Å");
}

function removeSoftHyphens(input) {
  return input.replace(/[\u00ad\u200b]/g, "");
}

function normalizeWhitespace(input) {
  return input
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function dedupeLines(lines) {
  return [...new Set(lines)];
}

function getDayKey(date) {
  return DAY_KEYS[date.getDay()];
}

function formatFinnishDate(date) {
  return new Intl.DateTimeFormat("fi-FI", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    year: "numeric"
  }).format(date);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
