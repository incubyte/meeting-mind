import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

/**
 * Settings manager for call type and descriptions
 * Handles CRUD operations on call settings stored as JSON
 */
class SettingsManager {
  constructor() {
    try {
      // Store in local directory instead of Electron userData
      this.dataDir = path.join(process.cwd(), 'data');
      console.log(`Using local data directory: ${this.dataDir}`);
      this.settingsPath = path.join(this.dataDir, 'call-settings.json');
      
      console.log(`Settings will be stored at: ${this.settingsPath}`);
      
      this.ensureDataDirectoryExists();
      this.loadSettings();
    } catch (error) {
      console.error('Error in SettingsManager constructor:', error);
      // Fall back to user data directory if local directory fails
      try {
        const userDataPath = app.getPath('userData');
        console.log(`Using fallback userData path: ${userDataPath}`);
        this.dataDir = path.join(userDataPath, 'data');
        this.settingsPath = path.join(this.dataDir, 'call-settings.json');
        this.ensureDataDirectoryExists();
        this.loadSettings();
      } catch (fallbackError) {
        console.error('Error using userData fallback:', fallbackError);
        throw new Error(`Cannot initialize settings storage: ${fallbackError.message}`);
      }
    }
  }

  /**
   * Ensure the data directory exists
   */
  ensureDataDirectoryExists() {
    try {
      console.log(`Checking data directory: ${this.dataDir}`);
      if (!fs.existsSync(this.dataDir)) {
        console.log(`Creating data directory: ${this.dataDir}`);
        fs.mkdirSync(this.dataDir, { recursive: true });
        console.log(`Data directory created successfully`);
      } else {
        console.log(`Data directory already exists`);
      }
      // Ensure write permissions by testing with a temp file
      const testFile = path.join(this.dataDir, '.test-write-access');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      console.log(`Successfully verified write permissions to data directory`);
    } catch (error) {
      console.error(`Error ensuring data directory exists:`, error);
      // Try a fallback directory
      try {
        this.dataDir = path.join(process.cwd(), 'data');
        console.log(`Using fallback data directory: ${this.dataDir}`);
        if (!fs.existsSync(this.dataDir)) {
          console.log(`Creating fallback data directory: ${this.dataDir}`);
          fs.mkdirSync(this.dataDir, { recursive: true });
        }
        this.settingsPath = path.join(this.dataDir, 'call-settings.json');
      } catch (fallbackError) {
        console.error(`Failed to create fallback data directory:`, fallbackError);
        throw new Error(`Cannot create settings directory: ${fallbackError.message}`);
      }
    }
  }

  /**
   * Load settings from disk
   */
  loadSettings() {
    try {
      console.log(`Attempting to load settings from: ${this.settingsPath}`);
      if (fs.existsSync(this.settingsPath)) {
        console.log(`Settings file exists, reading data`);
        const data = fs.readFileSync(this.settingsPath, 'utf8');
        console.log(`Read ${data.length} bytes of data`);
        
        try {
          this.settings = JSON.parse(data);
          console.log(`Successfully parsed settings with ${this.settings.callTypes?.length || 0} call types`);
        } catch (parseError) {
          console.error(`Error parsing settings JSON:`, parseError);
          // File exists but is corrupt, reset with defaults
          console.log(`Using default settings due to parse error`);
          this.resetToDefaultSettings();
        }
      } else {
        console.log(`Settings file does not exist, initializing defaults`);
        this.resetToDefaultSettings();
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      console.log(`Using empty settings due to error`);
      this.settings = { callTypes: [] };
    }
  }
  
  /**
   * Reset settings to defaults
   */
  resetToDefaultSettings() {
    this.settings = {
      callTypes: [
        {
          id: "interview",
          name: "Technical Interview",
          description: "<p>This is a technical interview to assess candidate skills.</p><p>Focus on both technical depth and communication.</p>"
        },
        {
          id: "sales-call",
          name: "Sales Call",
          description: "<p>Sales call with potential client.</p><p>Focus on understanding needs and presenting solutions.</p>"
        },
        {
          id: "one-on-one",
          name: "1:1 Meeting",
          description: "<p>Regular one-on-one meeting with team member.</p><p>Discuss progress, challenges, and career development.</p>"
        }
      ]
    };
    console.log(`Default settings created with ${this.settings.callTypes.length} call types`);
    this.saveSettings();
  }

  /**
   * Save settings to disk
   */
  saveSettings() {
    try {
      console.log(`Saving settings to: ${this.settingsPath}`);
      // Ensure directory exists before writing
      if (!fs.existsSync(path.dirname(this.settingsPath))) {
        console.log(`Creating directory for settings: ${path.dirname(this.settingsPath)}`);
        fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
      }
      
      // Format and write settings to file
      const data = JSON.stringify(this.settings, null, 2);
      console.log(`Writing ${data.length} bytes of data`);
      fs.writeFileSync(this.settingsPath, data, 'utf8');
      
      // Verify the file was written
      if (fs.existsSync(this.settingsPath)) {
        const stats = fs.statSync(this.settingsPath);
        console.log(`Settings saved successfully (${stats.size} bytes)`);
        return true;
      } else {
        console.error(`File doesn't exist after save operation`);
        return false;
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      // Include more details in the error message
      console.error(`Path: ${this.settingsPath}, Error type: ${error.code}, Message: ${error.message}`);
      
      // Try saving to a fallback location in userData if the main one fails
      try {
        const userDataPath = app.getPath('userData');
        const fallbackPath = path.join(userDataPath, 'call-settings.json');
        console.log(`Attempting to save to fallback location: ${fallbackPath}`);
        const data = JSON.stringify(this.settings, null, 2);
        fs.writeFileSync(fallbackPath, data, 'utf8');
        console.log(`Successfully saved to fallback location`);
        
        // Update the path to use the fallback from now on
        this.settingsPath = fallbackPath;
        return true;
      } catch (fallbackError) {
        console.error(`Failed to save to fallback location:`, fallbackError);
        return false;
      }
    }
  }

  /**
   * Get all call types
   * @returns {Array} Array of call types
   */
  getCallTypes() {
    return this.settings.callTypes || [];
  }

  /**
   * Get a specific call type by ID
   * @param {string} id - Call type ID
   * @returns {Object|null} Call type object or null if not found
   */
  getCallType(id) {
    return this.settings.callTypes.find(type => type.id === id) || null;
  }

  /**
   * Add a new call type
   * @param {Object} callType - Call type object with name and description
   * @returns {boolean} Success flag
   */
  addCallType(callType) {
    // Generate a unique ID based on name and timestamp
    const id = callType.name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString(36);
    
    const newCallType = {
      id,
      name: callType.name,
      description: callType.description || ''
    };
    
    this.settings.callTypes.push(newCallType);
    return this.saveSettings();
  }

  /**
   * Update an existing call type
   * @param {string} id - Call type ID to update
   * @param {Object} updates - Updated properties
   * @returns {boolean} Success flag
   */
  updateCallType(id, updates) {
    const index = this.settings.callTypes.findIndex(type => type.id === id);
    if (index === -1) return false;
    
    this.settings.callTypes[index] = {
      ...this.settings.callTypes[index],
      ...updates
    };
    
    return this.saveSettings();
  }

  /**
   * Delete a call type
   * @param {string} id - Call type ID to delete
   * @returns {boolean} Success flag
   */
  deleteCallType(id) {
    const initialLength = this.settings.callTypes.length;
    this.settings.callTypes = this.settings.callTypes.filter(type => type.id !== id);
    
    if (this.settings.callTypes.length === initialLength) {
      return false; // Nothing was deleted
    }
    
    return this.saveSettings();
  }
}

// Export a singleton instance
const settingsManager = new SettingsManager();
export default settingsManager;