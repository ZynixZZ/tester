const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors');
require('dotenv').config();

// Initialize Google AI
const PALM_API_KEY = process.env.PALM_API_KEY;
console.log('API Key status:', PALM_API_KEY ? 'Present' : 'Missing');

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

        // Get video metadata from YouTube
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const videoDetails = {
            id: videoId,
            url: videoUrl,
            embedUrl: `https://www.youtube.com/embed/${videoId}`
        };

        // Initialize AI
        console.log('Preparing AI analysis...');
        const genAI = new GoogleGenerativeAI(PALM_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `
            Please analyze this YouTube video with ID: ${videoId}
            URL: ${videoUrl}
            
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
            videoDetails: videoDetails,
            status: 'success'
        });

    } catch (error) {
        console.error('Error during video analysis:', error);
        res.status(500).json({
            error: 'Failed to analyze video',
            details: error.message,
            suggestion: 'Please try a different video or check the URL'
        });
    }
});
