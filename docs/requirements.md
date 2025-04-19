# ✅ Meeting Mind System Requirements

This document outlines the system requirements for running the Meeting Mind application.

## 💻 Hardware Requirements

### Recommended Specifications

- **Processor**: Multi-core CPU (2+ cores recommended)
- **Memory**: 4GB RAM minimum, 8GB or more recommended
- **Disk Space**: 500MB for application, plus additional space for recordings
- **Audio**: Working microphone and speaker system
- **Internet**: Broadband connection required for API access

## 🖥️ Operating System Requirements

### Required OS

- **Linux**: Any modern distribution with PulseAudio audio system
  - Ubuntu 20.04 or newer
  - Debian 11 or newer
  - Fedora 35 or newer
  - Other distributions with PulseAudio should work but are not officially tested

### PulseAudio Requirements

Meeting Mind relies heavily on PulseAudio for audio device management:

- PulseAudio must be installed and running
- PulseAudio monitor sources must be available
- User must have permissions to access audio devices

To verify PulseAudio is working correctly:

```bash
# Check if PulseAudio is running
pulseaudio --check

# List available audio sources (should include monitor devices)
pactl list sources | grep -E 'Source|Name|monitor'

# Check default devices
pactl info | grep Default
```

## 🖧 Network Requirements

### API Access

- **Outbound connections** must be allowed to the following domains:
  - `api.openai.com` (for OpenAI Whisper API)
  - `openrouter.ai` (for Gemini Pro model access)

### Bandwidth Considerations

- **Upload bandwidth**: At least 1 Mbps for sending audio files
- **Download bandwidth**: At least 1 Mbps for receiving transcriptions and analyses
- **Data usage**: Approximately 1MB per minute of conversation

## 🧰 Software Dependencies

### Required Software

- **Node.js**: Version 14 or higher
- **npm**: Version 6 or higher (typically bundled with Node.js)
- **PulseAudio**: For audio device management
- **pdftotext** (optional): For PDF document processing (part of poppler-utils)

### Installation Commands

On Ubuntu/Debian:

```bash
# Install Node.js and npm
sudo apt update
sudo apt install nodejs npm

# Ensure PulseAudio is installed
sudo apt install pulseaudio

# Optional: Install poppler-utils for PDF processing
sudo apt install poppler-utils
```

On Fedora:

```bash
# Install Node.js and npm
sudo dnf install nodejs npm

# Ensure PulseAudio is installed
sudo dnf install pulseaudio

# Optional: Install poppler-utils for PDF processing
sudo dnf install poppler-utils
```

## 🔑 API Keys

### Required API Keys

- **OpenAI API Key**: Required for transcription using Whisper API

### Optional API Keys

- **OpenRouter API Key**: For accessing Google's Gemini Pro model
  - If not provided, the application will attempt to use OpenAI for analysis, which may limit capabilities

## 🧪 Compatibility Testing

The application has been tested on the following environments:

- Ubuntu 22.04 LTS with PulseAudio
- Debian 11 with PulseAudio
- Fedora 36 with PulseAudio

## 🔍 Troubleshooting Common Requirements Issues

### PulseAudio Monitor Device Not Found

If the application cannot find the PulseAudio monitor device:

1. Verify PulseAudio is running:
   ```bash
   pulseaudio --check
   ```

2. If not running, start PulseAudio:
   ```bash
   pulseaudio --start
   ```

3. Check if monitor sources exist:
   ```bash
   pactl list sources | grep monitor
   ```

4. Ensure your user has access to audio devices:
   ```bash
   sudo usermod -a -G audio $USER
   # Log out and back in after running this command
   ```

### Node.js Version Issues

If you encounter issues with Node.js versions:

1. Check your current Node.js version:
   ```bash
   node --version
   ```

2. If outdated, upgrade using nvm (Node Version Manager):
   ```bash
   # Install nvm
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
   
   # Install and use a compatible Node.js version
   nvm install 16
   nvm use 16
   ```
