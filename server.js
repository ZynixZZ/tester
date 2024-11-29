const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors');
const path = require('path');
const app = express();
require('dotenv').config();

// Middleware setup
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/video-summarizer', (req, res) => {
    res.sendFile(path.join(__dirname, 'video-summarizer.html'));
});

// API endpoints
app.post('/api/summarize', async (req, res) => {
    try {
        const { url } = req.body;
        console.log('Processing URL:', url);

        // Extract video ID
        const videoId = url.split('v=')[1]?.split('&')[0] || url.split('youtu.be/')[1]?.split('?')[0];
        
        if (!videoId) {
            throw new Error('Invalid YouTube URL');
        }

        console.log('Video ID:', videoId);

        // Initialize AI
        console.log('Preparing AI analysis...');
        const genAI = new GoogleGenerativeAI(PALM_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `
            Please analyze this YouTube video with ID: ${videoId}
            URL: https://www.youtube.com/watch?v=${videoId}
            
            Please provide:
            1. A brief overview of what this video might contain
            2. Potential key points based on the video format
            3. Suggested target audience
            4. Recommendations for viewers
            
            Format it in a clear, readable way.
        `;

        console.log('Generating AI summary...');
        const result = await model.generateContent(prompt);
        
        if (!result || !result.response) {
            throw new Error('Failed to generate AI response');
        }

        const summary = result.response.text();
        console.log('Summary generated successfully');

        res.json({
            summary: summary,
            videoDetails: {
                id: videoId,
                url: `https://www.youtube.com/watch?v=${videoId}`
            },
            status: 'success'
        });

    } catch (error) {
        console.error('Error during video analysis:', {
            message: error.message,
            stack: error.stack,
            type: error.constructor.name
        });

        res.status(500).json({
            error: 'Failed to analyze video',
            details: error.message,
            suggestion: 'Please try a different video or check the URL'
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Available routes:');
    console.log('- / (index)');
    console.log('- /signup');
    console.log('- /dashboard');
    console.log('- /video-summarizer');
    console.log('- /api/summarize (POST)');
});

module.exports = app;
