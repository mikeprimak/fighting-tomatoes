// packages/backend/test-api.js
const baseUrl = 'http://localhost:3001';

// Helper function to make requests
async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    
    const data = await response.json();
    
    console.log(`\n${options.method || 'GET'} ${url}`);
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    return { response, data };
  } catch (error) {
    console.error(`Error with ${url}:`, error.message);
    return { error };
  }
}

// Test functions
async function testHealthCheck() {
  console.log('\n=== TESTING HEALTH CHECK ===');
  await makeRequest(`${baseUrl}/health`);
}

async function testApiStatus() {
  console.log('\n=== TESTING API STATUS ===');
  await makeRequest(`${baseUrl}/api/status`);
}

async function testPublicEndpoints() {
  console.log('\n=== TESTING PUBLIC ENDPOINTS ===');
  
  // Test fights endpoint
  await makeRequest(`${baseUrl}/api/fights?limit=5`);
  
  // Test events endpoint
  await makeRequest(`${baseUrl}/api/events?limit=3`);
  
  // Test fighters endpoint
  await makeRequest(`${baseUrl}/api/fighters?limit=5`);
  
  // Test tags endpoint
  await makeRequest(`${baseUrl}/api/tags`);
  
  // Test tags for specific rating
  await makeRequest(`${baseUrl}/api/tags?rating=9`);
  
  // Test search endpoints
  await makeRequest(`${baseUrl}/api/fights/search?q=UFC`);
  await makeRequest(`${baseUrl}/api/fighters/search?q=Jones`);
}

async function testAuthenticationRequired() {
  console.log('\n=== TESTING AUTHENTICATION REQUIRED ENDPOINTS ===');
  
  // These should return 401 without token
  await makeRequest(`${baseUrl}/api/users/me`);
  
  await makeRequest(`${baseUrl}/api/fights/some-uuid/rate`, {
    method: 'POST',
    body: JSON.stringify({ rating: 8 }),
  });
}

async function testWithAuth() {
  console.log('\n=== TESTING WITH AUTHENTICATION ===');
  
  // First, you need to get a valid token
  // This assumes you have existing auth endpoints
  console.log('NOTE: To test authenticated endpoints, you need a valid JWT token');
  console.log('You can get one by:');
  console.log('1. Logging in through your existing auth endpoint');
  console.log('2. Or temporarily add a test token to this script');
  
  // Example of how to test with a token (uncomment and add real token):
  /*
  const token = 'your-jwt-token-here';
  
  await makeRequest(`${baseUrl}/api/users/me`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  */
}

async function testDataStructure() {
  console.log('\n=== TESTING DATA STRUCTURE ===');
  
  // Test that fight data has the expected 0-100 rating scale
  const { data } = await makeRequest(`${baseUrl}/api/fights?limit=1`);
  
  if (data && data.fights && data.fights.length > 0) {
    const fight = data.fights[0];
    console.log('\nFight data structure check:');
    console.log('- Has averageRating:', typeof fight.averageRating);
    console.log('- Rating value:', fight.averageRating);
    console.log('- Expected: number between 0-100');
    
    if (typeof fight.averageRating === 'number' && fight.averageRating <= 100) {
      console.log('✅ Rating scale looks correct (0-100)');
    } else {
      console.log('❌ Rating scale might be wrong');
    }
  }
}

async function testErrorHandling() {
  console.log('\n=== TESTING ERROR HANDLING ===');
  
  // Test 404 routes
  await makeRequest(`${baseUrl}/api/nonexistent`);
  
  // Test invalid UUID
  await makeRequest(`${baseUrl}/api/fights/invalid-uuid`);
  
  // Test malformed JSON
  await makeRequest(`${baseUrl}/api/fights/123e4567-e89b-12d3-a456-426614174000/rate`, {
    method: 'POST',
    body: 'invalid json',
  });
}

async function runAllTests() {
  console.log('Starting API Tests...');
  console.log('Make sure your server is running on http://localhost:3001');
  
  try {
    await testHealthCheck();
    await testApiStatus();
    await testPublicEndpoints();
    await testAuthenticationRequired();
    await testWithAuth();
    await testDataStructure();
    await testErrorHandling();
    
    console.log('\n=== TEST SUMMARY ===');
    console.log('✅ Basic connectivity tests completed');
    console.log('✅ Public endpoints tested');
    console.log('✅ Authentication checks tested');
    console.log('✅ Error handling tested');
    console.log('\nNext steps:');
    console.log('1. Add a real JWT token to test authenticated endpoints');
    console.log('2. Test with your actual seeded data');
    console.log('3. Test the mobile app integration');
    
  } catch (error) {
    console.error('Test runner error:', error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  makeRequest,
  testHealthCheck,
  testPublicEndpoints,
  runAllTests,
};