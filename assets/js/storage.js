// to make things a little easier in the future, I'm making a dedicated object for handling browser localStorage

// The key to commenting your code and making it 30-50% more maintainable is by using JSDocs.
// https://jsdoc.app/about-getting-started 


const storage = {
    /**
     * Store a value in the local storage with the specified key.
     * The value is converted to a JSON string before being stored,
     * because local storage can only store strings, and JSON.stringify
     * allows us to store complex data types (like objects or arrays) as strings.
     *
     * @param {string} key - The key under which the value will be stored.
     * @param {any} value - The value to be stored, which will be stringified.
     * @throws {Error} Will log an error if setting the item in local storage fails.
     */
    set(key, value) {
        try { // wrap in a try...catch block to catch errors and stuff
            localStorage.setItem(key, JSON.stringify(value)); // wrap in json cus 
        } catch (error) {
            console.error(`Error setting localStorage key "${key}":`, error);
        }
    },

    /**
     * Retrieve a value from local storage using the specified key.
     * The stored JSON string is automatically parsed back into its original
     * data type (object, array, etc.). If the key doesn't exist or parsing
     * fails, the defaultValue is returned instead.
     *
     * @param {string} key - The key under which the value is stored.
     * @param {any} defaultValue - The fallback value to return if the key doesn't exist or parsing fails. Defaults to null.
     * @returns {any} The parsed value from localStorage, or defaultValue if not found.
     * @throws {Error} Will log an error if getting or parsing the item from local storage fails.
     */
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error(`Error getting localStorage key "${key}":`, error);
            return defaultValue;
        }
    },

    /**
     * Remove a specific item from local storage using its key.
     * This permanently deletes the stored value associated with the key.
     * If the key doesn't exist, this operation does nothing (no error is thrown).
     *
     * @param {string} key - The key of the item to remove from localStorage.
     * @throws {Error} Will log an error if removing the item from local storage fails.
     */
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error(`Error removing localStorage key "${key}":`, error);
        }
    },

    /**
     * Clear all items from local storage.
     * This removes every key-value pair stored in localStorage for the current domain.
     * Use with caution as this action cannot be undone and will delete all stored data.
     *
     * @throws {Error} Will log an error if clearing local storage fails.
     */
    clear() {
        try {
            localStorage.clear();
        } catch (error) {
            console.error('Error clearing localStorage:', error);
        }
    }
};

export default storage;