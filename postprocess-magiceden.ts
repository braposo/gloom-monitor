// Helper library written for useful postprocessing tasks with Flat Data
// Has helper functions for manipulating csv, txt, json, excel, zip, and image files
import {
  readJSON,
  writeCSV,
  removeFile,
} from "https://deno.land/x/flat@0.0.13/mod.ts";

import { DB } from "https://deno.land/x/sqlite@v3.1.1/mod.ts";

type Item = {
  mintAddress: string;
  price: number;
  title: string;
};

type RawData = {
  results: Array<Item>;
};

type ParsedData = {
  id: number;
  price: number;
  moonRank?: string;
  rank?: string;
  meURL: string;
  rarityURL: string;
} & Traits;

type Traits = {
  hair?: string;
  headAccessory?: string;
  faceAccessorry?: string;
  glasses?: string;
  clothes?: string;
  eyes?: string;
  eyebrows?: string;
  mouth?: string;
  skin?: string;
  background?: string;
};

const headers = [
  "id",
  "rank",
  "background",
  "skin",
  "hair",
  "mouth",
  "eyes",
  "eyebrows",
  "clothes",
  "headAccessory",
  "faceAccessory",
  "glasses",
];

type RarityData = { rank: string } & Traits;

// Step 1: Read the downloaded_filename JSON
const filename = Deno.args[0];
const data: RawData = await readJSON(filename);
const moonrank: Record<string, string> = await readJSON(
  "zzz/gloom-moonrank.json"
);

const db = new DB("zzz/glooms.db");

let minPrice = Infinity;

// Step 2: Filter specific data we want to keep and write to a new JSON file
const enhancedData: Array<ParsedData> = data.results
  .map((gloom) => {
    const [_, id] = gloom.title.split("#");
    const rarityURL = `https://gloom-rarity-page.vercel.app/punk/${id}`;
    const meURL = `https://magiceden.io/item-details/${gloom.mintAddress}`;

    const queryData = db.query("SELECT * from gloomRarity WHERE id = ?", [id]);

    if (!queryData.length) {
      console.log("Couldn't find data for gloom:", id);
      return { id: parseInt(id), price: gloom.price, rarityURL, meURL };
    }

    const rarityData = queryData[0];

    const rarity: RarityData = headers.reduce<RarityData>(
      (acc, header, index) => {
        return {
          ...acc,
          [header]: rarityData[index],
        };
      },
      { rank: "" }
    );

    if (gloom.price < minPrice) {
      minPrice = gloom.price;
    }

    return {
      id: parseInt(id),
      price: gloom.price,
      moonRank: moonrank[id],
      ...rarity,
      rarityURL,
      meURL,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.id - b.id);

db.close();

console.log("Initial Glooms:", data.results.length);
console.log("Processed Glooms:", enhancedData.length);

const dataWithScore = enhancedData.map((item) => {
  const { id, price, moonRank, rank, ...rest } = item;
  return {
    id,
    price,
    moonRank,
    rank,
    score: (price - minPrice) * 100 + parseInt(moonRank || ""),
    ...rest,
  };
});

// Step 3. Write a new JSON file with our filtered data
await writeCSV("gloom-data-magiceden.csv", dataWithScore);
console.log("Wrote gloom data");

const sortedData = enhancedData.sort((a, b) => {
  const aRank = parseInt(a.rank || "") + parseInt(a.moonRank || "");
  const bRank = parseInt(b.rank || "") + parseInt(b.moonRank || "");

  return aRank - bRank;
});

const buckets = sortedData.reduce<Array<Array<ParsedData>>>(
  (data, gloom) => {
    let bucket: number | undefined = undefined;
    if (gloom.price <= 0.5) {
      bucket = 0;
    } else if (gloom.price <= 1) {
      bucket = 1;
    } else if (gloom.price <= 1.5) {
      bucket = 2;
    } else if (gloom.price <= 2) {
      bucket = 3;
    }

    if (bucket !== undefined) {
      data[bucket].push(gloom);
    }

    return data;
  },
  [[], [], [], []]
);

const topPicks = buckets.reduce((picks, bucket) => {
  const bucketSelection = bucket.slice(0, 3);
  return [...picks, ...bucketSelection];
}, []);

await writeCSV("gloom-picks-magiceden.csv", topPicks);
console.log("Wrote gloom picks");

await removeFile(filename);
