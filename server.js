const express = require('express');
const cors = require('cors');
const path = require('path');
const { YoutubeTranscript } = require('youtube-transcript');
const ytdl = require('ytdl-core');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.PALM_API_KEY);

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        if (!req.body.message) {
            throw new Error('Message is required');
        }

        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent(req.body.message);
        const response = result.response.text();

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
        console.log('Starting summarization for URL:', url);

        // Check if URL is provided
        if (!url) {
            throw new Error('No URL provided');
        }

        // Check API key
        if (!process.env.PALM_API_KEY) {
            console.error('API Key missing');
            throw new Error('API key is not configured');
        }

        // Validate YouTube URL
        if (!ytdl.validateURL(url)) {
            console.error('Invalid YouTube URL:', url);
            throw new Error('Invalid YouTube URL');
        }

        // Extract video ID
        const videoId = ytdl.getVideoID(url);
        console.log('Video ID:', videoId);

        // Get transcript
        console.log('Fetching transcript...');
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        console.log('Transcript fetched successfully');

        if (!transcript || transcript.length === 0) {
            throw new Error('No transcript available');
        }

        const fullText = transcript.map(part => part.text).join(' ');
        console.log('Transcript length:', fullText.length, 'characters');

        // Initialize AI
        console.log('Initializing AI model...');
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        // Prepare prompt
        const prompt = `Please summarize this video transcript in a clear and organized way:
            ${fullText.substring(0, 30000)} // Limit text length to avoid token limits
            
            Please format the summary as follows:
            1. Main Topic
            2. Key Points
            3. Summary
            4. Important Details`;

        // Generate summary
        console.log('Generating summary...');
        const result = await model.generateContent(prompt);
        console.log('AI response received');

        if (!result || !result.response) {
            throw new Error('Failed to generate AI response');
        }

        const summary = result.response.text();
        console.log('Summary generated successfully, length:', summary.length);

        res.json({ 
            summary: summary,
            status: 'success',
            videoId: videoId
        });

    } catch (error) {
        console.error('Detailed error:', error);
        let errorMessage = 'Failed to generate summary';

        if (error.message.includes('API key')) {
            errorMessage = 'API configuration error';
        } else if (error.message.includes('Invalid YouTube URL')) {
            errorMessage = 'Please enter a valid YouTube URL';
        } else if (error.message.includes('Transcript is disabled')) {
            errorMessage = 'This video does not have captions enabled. Please try a video with captions.';
        } else if (error.message.includes('transcript')) {
            errorMessage = 'No captions available for this video';
        }

        // Log the full error details
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        res.status(500).json({ 
            error: errorMessage,
            details: error.message,
            type: error.constructor.name
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('- POST /api/chat');
    console.log('- POST /api/summarize');
});