# JobSignal — AI Gmail Job Application Tracker

An AI-powered agent that automatically scans your Gmail, 
classifies job application emails, and sends you a nightly 
summary of your job search pipeline.

## What it does
- Scans Gmail for job application emails automatically
- Classifies emails by stage: Applied, Interview, Offer, Rejected
- Detects company names, roles, and application sources
- Filters out ads and newsletters
- Sends a beautiful HTML summary email every night at 11 PM
- Auto-generates a live dashboard in Google Sheets
- Logs all activity in an Agent Log tab

## Tech Stack
- Google Apps Script (JavaScript)
- Gmail API
- Google Sheets API
- HTML email generation

## Setup
1. Open your Google Sheet
2. Extensions → Apps Script
3. Paste JobSignal_v2.js into Code.gs
4. Create new file → Paste JobSignal_Dashboard.js
5. Set timezone in Project Settings
6. Run runFullSync (pulls 365 days of history)
7. Run createDailyTrigger (sets up 11 PM automation)

## Dashboard
The live web dashboard is built with Google Apps Script 
HTML Service. Deploy as Web App to get a shareable URL.

## Features
- Smart spam filtering
- Priority scoring (HIGH/MEDIUM/LOW)
- AI-recommended actions per application
- Color coded by stage
- Response rate tracking
