import { Client, GatewayIntentBits } from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
} from "@discordjs/voice";
import dotenv from "dotenv";
import { Readable } from "stream";
import ffmpeg from "ffmpeg-static";
import prism from "prism-media";
import fetch from "node-fetch"; // Node 18+ has native fetch

dotenv.config();

const TOKEN = process.env.ACCESS_KEY;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Utility function: wrap a buffer in a proper Readable stream
function bufferToStream(buffer) {
  return new Readable({
    read() {
      this.push(buffer);
      this.push(null); // signal end of stream
    },
  });
}

// Utility function: decode raw audio buffer to PCM via FFmpeg
function decodeToPCM(buffer) {
  const inputStream = bufferToStream(buffer);
  const ffmpegStream = new prism.FFmpeg({
    args: [
      "-i", "pipe:0",
      "-f", "s16le",
      "-ar", "48000",
      "-ac", "2",
      "-loglevel", "0",
    ],
    shell: false,
    executable: ffmpeg,
  });
  return inputStream.pipe(ffmpegStream);
}

client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("!play") || message.author.bot) return;

  const args = message.content.split(" ");
  const songId = args[1];
  if (!songId) {
    return message.reply("Please provide a song ID, e.g. `!play 1`");
  }

  const vc = message.member.voice.channel;
  if (!vc) {
    return message.reply("Join a voice channel first!");
  }

  try {
    const res = await fetch(`https://audioslave-l9ch.onrender.com/music/${songId}`);
    if (!res.ok) throw new Error("Song not found");

    const data = await res.json()
    const audioRes = await fetch(data.url)

    if (!audioRes) throw new Error('Failed to pull from S3')

    const resource = createAudioResource(audioRes.body, {
      inputType: StreamType.Arbitrary,
    });

    // join voice channel
    const connection = joinVoiceChannel({
      channelId: vc.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    // create audio player and play
    const player = createAudioPlayer();
    connection.subscribe(player);
    player.play(resource);

    player.on(AudioPlayerStatus.Playing, () => {
      message.channel.send(`🎶 Now playing: Song ${songId}`);
    });

    player.on("error", (error) => {
      console.error(error);
      message.channel.send("Error while playing audio.");
    });
  } catch (err) {
    console.error(err);
    message.reply("Couldn’t play that song.");
  }
});

client.login(TOKEN);
