const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

// Initialize Google AI
const PALM_API_KEY = process.env.PALM_API_KEY;
console.log('API Key status:', PALM_API_KEY ? 'Present' : 'Missing');

app.post('/api/summarize', async (req, res) => {
    try {
        const { url } = req.body;
        console.log('Processing URL:', url);

        // Extract video ID from URL
        const videoId = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i)?.[1];
        
        if (!videoId) {
            throw new Error('Invalid YouTube URL');
        }

        console.log('Video ID:', videoId);

        // Get video info from oEmbed
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        
        try {
            console.log('Fetching video info...');
            const response = await axios.get(oembedUrl);
            const videoInfo = response.data;
            console.log('Video info fetched successfully');

            // Get video page for more details
            const videoPageResponse = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            // Extract description from page content
            const description = videoPageResponse.data.match(/"description":{"simpleText":"(.*?)"}}/)?.[1] || 'No description available';

            const videoDetails = {
                title: videoInfo.title || 'Unknown Title',
                author: videoInfo.author_name || 'Unknown Author',
                description: description,
                thumbnailUrl: videoInfo.thumbnail_url
            };

            // Initialize AI
            console.log('Preparing AI analysis...');
            const genAI = new GoogleGenerativeAI(PALM_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });

            const prompt = `
                Please analyze this YouTube video information:
                
                TITLE: ${videoDetails.title}
                CREATOR: ${videoDetails.author}
                
                DESCRIPTION:
                ${videoDetails.description}
                
                Please provide a comprehensive analysis including:
                1. Main Topic/Theme
                2. Key Points
                3. Content Overview
                4. Target Audience
                5. Value Proposition
                
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

        } catch (infoError) {
            console.error('Info fetch error:', infoError);
            throw new Error(`Failed to fetch video info: ${infoError.message}`);
        }

    } catch (error) {
        console.error('Error during video analysis:', error);
        res.status(500).json({
            error: 'Failed to analyze video',
            details: error.message,
            suggestion: 'Please try a different video or check the URL'
        });
    }
});
