import OpenAI from 'openai';
import ytdl from '@distube/ytdl-core';
import fs, { existsSync, writeFileSync } from 'fs';
import path from 'path';
import { youtubeDl as youtubedl } from 'youtube-dl-exec';

async function downloadSubtitles(videoUrl: string, outputDir: string): Promise<string> {
  const videoId = ytdl.getURLVideoID(videoUrl);
  const subtitlesPath = path.join(outputDir, `${videoId}`);

  return new Promise((resolve, reject) => {
    youtubedl(videoUrl, {
      // writeSub: true,
      // subLang: 'en',
      writeAutoSub: true,
      skipDownload: true,
      output: subtitlesPath,
    })
      .then(() => {
        resolve(subtitlesPath + '.en.vtt');
      })
      .catch((err) => {
        reject(err);
      });
  });
}

function splitTextIntoChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  let currentChunk = '';

  for (const line of text.split('\n')) {
    if ((currentChunk + line).length > chunkSize) {
      chunks.push(currentChunk);
      currentChunk = line; // Start a new chunk
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line; // Append line to the current chunk
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk); // Add the last chunk
  }

  return chunks;
}

async function translateTextWithGPT(text: string, targetLanguage: string): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const chunks = splitTextIntoChunks(text, 2000); // Split text into chunks of 2000 characters
  const translations = [];

  for (const [index, chunk] of chunks.entries()) {
    console.log(`Translating chunk ${index + 1}/${chunks.length}...`);
    const prompt = `
    Translate the following text into ${targetLanguage}. 
    Keep the original format,
    And only translate the text, no extra information, no code blocks, no markdown, no quotes, no explanations.\n\n
    Ensure the entire content is translated without skipping any parts:

${chunk}`;

    const response = await openai.chat.completions.create({
      model: 'o4-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that translates text.' },
        { role: 'user', content: prompt },
      ],
    });

    translations.push(response.choices[0].message?.content || '');
  }

  return translations.join('\n');
}

async function generateDoubleSubtitles(transcription: string): Promise<string> {
  const chineseTranslation = await translateTextWithGPT(transcription, 'Simplified Chinese'); // Translate the entire transcription

  // Combine the English and Chinese subtitles without matching line by line
  return `${transcription}\n\n${chineseTranslation}`;
}

async function main() {
  console.log('Welcome to the YouTube Subtitle Translator!');

  const videoUrl = 'https://www.youtube.com/watch?v=BdfsuRS8UfA'; // Replace with actual URL
  const outputDir = path.resolve(__dirname, '../downloads');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  try {
    console.log('Downloading subtitles...');
    const subtitlesPath = await downloadSubtitles(videoUrl, outputDir);
    console.log(`Subtitles downloaded to: ${subtitlesPath}`);

    const originalSubtitles = fs.readFileSync(subtitlesPath, 'utf-8');

    console.log('Translating subtitles...');
    const translatedSubtitles = await translateTextWithGPT(originalSubtitles, 'Simplified Chinese');

    const translatedPath = path.join(outputDir, `${ytdl.getURLVideoID(videoUrl)}.cn.vtt`);
    fs.writeFileSync(translatedPath, translatedSubtitles, 'utf-8');
    console.log(`Translated subtitles saved to: ${translatedPath}`);
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch((error) => console.error('Error:', error));