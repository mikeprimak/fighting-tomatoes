// Test analytics implementation
const API_BASE_URL = 'http://localhost:3001/api';

async function testAnalytics() {
  console.log('🧪 Testing FightCrewApp Analytics System\n');

  try {
    // Test 1: Track anonymous event
    console.log('1. Testing anonymous event tracking...');
    const trackResponse = await fetch(`${API_BASE_URL}/analytics/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventName: 'app_opened',
        eventType: 'ENGAGEMENT',
        platform: 'web',
        appVersion: '1.0.0',
        properties: {
          testMode: true,
        },
      }),
    });

    if (trackResponse.ok) {
      console.log('✅ Anonymous event tracking successful');
    } else {
      const error = await trackResponse.text();
      console.log('❌ Anonymous event tracking failed:', error);
    }

    // Test 2: Start session
    console.log('\n2. Testing session management...');
    const sessionId = `test_session_${Date.now()}`;

    const sessionResponse = await fetch(`${API_BASE_URL}/analytics/session/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        platform: 'web',
        appVersion: '1.0.0',
        deviceId: 'test_device_123',
      }),
    });

    if (sessionResponse.ok) {
      console.log('✅ Session start successful');
    } else {
      const error = await sessionResponse.text();
      console.log('❌ Session start failed:', error);
    }

    // Test 3: Batch event tracking
    console.log('\n3. Testing batch event tracking...');
    const batchResponse = await fetch(`${API_BASE_URL}/analytics/track-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        events: [
          {
            eventName: 'screen_viewed',
            eventType: 'NAVIGATION',
            platform: 'web',
            properties: { screenName: 'fights' },
          },
          {
            eventName: 'screen_viewed',
            eventType: 'NAVIGATION',
            platform: 'web',
            properties: { screenName: 'fighters' },
          },
        ],
      }),
    });

    if (batchResponse.ok) {
      const batchData = await batchResponse.json();
      console.log('✅ Batch event tracking successful:', batchData);
    } else {
      const error = await batchResponse.text();
      console.log('❌ Batch event tracking failed:', error);
    }

    // Test 4: End session
    console.log('\n4. Testing session end...');
    const endSessionResponse = await fetch(`${API_BASE_URL}/analytics/session/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
      }),
    });

    if (endSessionResponse.ok) {
      console.log('✅ Session end successful');
    } else {
      const error = await endSessionResponse.text();
      console.log('❌ Session end failed:', error);
    }

    // Test 5: API Health Check
    console.log('\n5. Testing API health...');
    const healthResponse = await fetch(`http://localhost:3001/health`);
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('✅ API is healthy:', healthData.status);
    } else {
      console.log('❌ API health check failed');
    }

    console.log('\n🎉 Analytics system test completed!');
    console.log('\n📊 Next steps:');
    console.log('- Check your database for analytics_events, user_sessions tables');
    console.log('- Test the mobile analytics integration');
    console.log('- Set up analytics dashboard queries');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

testAnalytics();