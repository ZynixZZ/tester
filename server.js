const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { YoutubeTranscript } = require('youtube-transcript');
const ytdl = require('ytdl-core');
require('dotenv').config();

const app = express();

// Enable CORS
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Use environment variables from your hosting platform
const PORT = process.env.PORT || 3000;
const PALM_API_KEY = process.env.PALM_API_KEY;

// Initialize Google AI
const genAI = new GoogleGenerativeAI(PALM_API_KEY);

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        console.log('Received chat request:', req.body);

        if (!req.body.message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Initialize the model
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        // Generate response
        const result = await model.generateContent(req.body.message);
        const response = result.response.text();

        console.log('AI Response:', response);
        res.json({ response: response });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ 
            error: 'Failed to process chat request',
            details: error.message 
        });
    }
});

// Video summarizer endpoint
app.post('/api/summarize', async (req, res) => {
    try {
        const { url } = req.body;
        console.log('Processing URL:', url);

        // Validate URL
        if (!ytdl.validateURL(url)) {
            throw new Error('Invalid YouTube URL');
        }

        // Extract video ID
        const videoId = ytdl.getVideoID(url);
        console.log('Video ID:', videoId);

        // Get transcript
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        if (!transcript || transcript.length === 0) {
            throw new Error('No transcript available for this video');
        }

        const fullText = transcript.map(part => part.text).join(' ');
        console.log('Transcript length:', fullText.length);

        // Use Gemini to generate summary
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        
        const prompt = `
            Please provide a comprehensive summary of this video transcript:
            ${fullText}
            
            Format the summary with:
            1. Main Topic
            2. Key Points
            3. Important Details
            4. Learning Steps
        `;

        const result = await model.generateContent(prompt);
        const summary = result.response.text();
        console.log('Summary generated');

        res.json({ summary });

    } catch (error) {
        console.error('Summarization error:', error);
        res.status(500).json({ 
            error: 'Failed to summarize video',
            details: error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});