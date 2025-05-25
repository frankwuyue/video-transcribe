import OpenAI from 'openai';
import ytdl from '@distube/ytdl-core';
import fs, { writeFileSync } from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

async function downloadYouTubeVideo(videoUrl: string, outputDir: string): Promise<string> {
  const videoId = ytdl.getURLVideoID(videoUrl); // Ensure compatibility with the new library
  const outputPath = path.join(outputDir, `${videoId}.mp4`);

  return new Promise((resolve, reject) => {
    const videoStream = ytdl(videoUrl, { quality: 'highestaudio' }); // Update usage if necessary
    const writeStream = fs.createWriteStream(outputPath);

    videoStream.pipe(writeStream);

    writeStream.on('finish', () => resolve(outputPath));
    writeStream.on('error', (err) => reject(err));
  });
}

async function extractAudio(videoPath: string, outputAudioPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .output(outputAudioPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .on('end', () => resolve(outputAudioPath))
      .on('error', (err) => reject(err))
      .run();
  });
}

async function transcribeAudio(audioPath: string): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const audioStream = fs.createReadStream(audioPath); // Use FsReadStream instead of Readable

  const response = await openai.audio.transcriptions.create({
    file: audioStream,
    model: 'whisper-1',
    response_format: 'text',
  });

  return response; // Directly return the response as it contains the transcription result
}

async function translateTextWithGPT(text: string, targetLanguage: string): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = `Translate the following text into ${targetLanguage}:

${text}`;

  const response = await openai.chat.completions.create({
    model: 'o4-mini',
    messages: [
      { role: 'system', content: 'You are a helpful assistant that translates text.' },
      { role: 'user', content: prompt },
    ],
  });

  return response.choices[0].message?.content || '';
}

async function generateDoubleSubtitles(transcription: string): Promise<string> {
  const chineseTranslation = await translateTextWithGPT(transcription, 'Simplified Chinese'); // Translate the entire transcription

  // Combine the English and Chinese subtitles without matching line by line
  return `${transcription}\n\n${chineseTranslation}`;
}

async function main() {
  console.log('Welcome to the YouTube Video Transcriber!');

  // Example: Initialize OpenAI API
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Example usage of downloadYouTubeVideo
  const videoUrl = 'https://www.youtube.com/watch?v=BdfsuRS8UfA'; // Replace with actual URL
  const outputDir = path.resolve(__dirname, '../downloads');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  try {
    console.log('Downloading video...');
    const videoPath = await downloadYouTubeVideo(videoUrl, outputDir);
    console.log(`Video downloaded to: ${videoPath}`);

    console.log('Extracting audio...');
    const audioPath = path.join(outputDir, `${ytdl.getURLVideoID(videoUrl)}.mp3`);
    await extractAudio(videoPath, audioPath);
    console.log(`Audio extracted to: ${audioPath}`);

    console.log('Transcribing audio...');
    const transcription = await transcribeAudio(audioPath);
    console.log('Transcription:', transcription);

    console.log('Generating double subtitles...');
    const doubleSubtitles = await generateDoubleSubtitles(transcription);

    const subtitlesPath = path.join(outputDir, `${ytdl.getURLVideoID(videoUrl)}_subtitles.txt`);
    writeFileSync(subtitlesPath, doubleSubtitles, 'utf-8');
    console.log(`Double subtitles saved to: ${subtitlesPath}`);
  } catch (error) {
    console.error('Error:', error);
  }

  // Placeholder for further processing
  console.log('This is where the translation logic will go.');
}

main().catch((error) => console.error('Error:', error));