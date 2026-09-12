@echo off
set "FREE_AI_CALLER_CWD=%CD%"
node "%~dp0..\src\free-ai.mjs" %*
