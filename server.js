const express = require('express');
const cors = require('cors');
const { YoutubeTranscript } = require('youtube-transcript');
const ytdl = require('ytdl-core');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const util = require('util');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.PALM_API_KEY);

// Define the summarize endpoint
app.post('/api/summarize', async (req, res) => {
    try {
        const { url } = req.body;
        console.log('Received URL:', url);

        // Check if URL is provided
        if (!url) {
            throw new Error('No URL provided');
        }

        // Check API key
        if (!process.env.PALM_API_KEY) {
            console.error('API Key missing or invalid');
            throw new Error('API key is not configured');
        }

        // Validate YouTube URL
        if (!ytdl.validateURL(url)) {
            console.error('Invalid YouTube URL:', url);
            throw new Error('Invalid YouTube URL');
        }

        // Extract video ID
        const videoId = ytdl.getVideoID(url);
        console.log('Processing video ID:', videoId);

        try {
            // Get transcript
            console.log('Fetching transcript...');
            const transcript = await YoutubeTranscript.fetchTranscript(videoId);
            
            if (!transcript || transcript.length === 0) {
                throw new Error('No transcript available for this video');
            }

            const fullText = transcript.map(part => part.text).join(' ');
            console.log('Transcript length:', fullText.length);

            // Initialize AI
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await model.generateContent(fullText);
            const summary = result.response.text();

            res.json({ 
                summary: summary,
                status: 'success'
            });

        } catch (transcriptError) {
            console.error('Transcript error:', transcriptError);
            if (transcriptError.message.includes('Transcript is disabled')) {
                throw new Error('This video does not have captions enabled. Please try a different video with captions.');
            }
            throw transcriptError;
        }

    } catch (error) {
        console.error('Error:', error.message);
        let errorMessage = 'Failed to generate summary';

        if (error.message.includes('API key')) {
            errorMessage = 'API configuration error';
        } else if (error.message.includes('Invalid YouTube URL')) {
            errorMessage = 'Please enter a valid YouTube URL';
        } else if (error.message.includes('captions enabled')) {
            errorMessage = error.message;
        } else if (error.message.includes('transcript')) {
            errorMessage = 'No captions available for this video';
        }

        res.status(500).json({ 
            error: errorMessage,
            details: error.message
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('API endpoints:');
    console.log(`- POST /api/summarize`);
});