function validateIfQueryIsOnlyReadOnly(query) {
    // Convert the query to lowercase for case-insensitive matching
    const lowerQuery = query.toLowerCase().trim();
  
    // Define patterns for non-read operations
    const writePatterns = [
      /\binsert\b/,
      /\bupdate\b/,
      /\bdelete\b/,
      /\bdrop\b/,
      /\bcreate\b/,
      /\balter\b/,
      /\btruncate\b/,
      /\brename\b/,
      /\breplace\b/,
      /\bmerge\b/
    ];
  
    // Check if the query starts with a read operation
    const readOperations = ['select', 'show', 'describe', 'explain'];
    const startsWithReadOperation = readOperations.some(op => lowerQuery.startsWith(op));
  
    // If it doesn't start with a read operation, it's not read-only
    if (!startsWithReadOperation) {
      return false;
    }
  
    // Check if any write patterns are found in the query
    for (const pattern of writePatterns) {
      if (pattern.test(lowerQuery)) {
        return false;
      }
    }
  
    // If we've made it this far, the query is likely read-only
    return true;
  }



module.exports = { validateIfQueryIsOnlyReadOnly };