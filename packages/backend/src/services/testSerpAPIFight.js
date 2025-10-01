/**
 * Test SerpAPI Google Sports Results for UFC Fight Night: Ulberg vs Reyes
 */

const { getJson } = require("serpapi");

console.log('Testing SerpAPI for UFC Fight Night: Ulberg vs Reyes\n');

// Test 1: Generic "UFC" query
console.log('=== Test 1: Query "UFC" ===');
getJson({
  q: "UFC",
  location: "austin, texas, united states",
  api_key: "7d8cc6a290cb006c8345fd50051a6b2a0c884d4e22cfdc6d15a4d9eb652eece9"
}, (json) => {
  console.log('Sports Results:');
  console.log(JSON.stringify(json["sports_results"], null, 2));
  console.log('\n');

  // Test 2: Specific event query
  console.log('=== Test 2: Query "UFC Fight Night Ulberg vs Reyes" ===');
  getJson({
    q: "UFC Fight Night Ulberg vs Reyes",
    location: "austin, texas, united states",
    api_key: "7d8cc6a290cb006c8345fd50051a6b2a0c884d4e22cfdc6d15a4d9eb652eece9"
  }, (json2) => {
    console.log('Sports Results:');
    console.log(JSON.stringify(json2["sports_results"], null, 2));
    console.log('\nKnowledge Graph:');
    console.log(JSON.stringify(json2["knowledge_graph"], null, 2));
    console.log('\n');

    // Test 3: Fighter names
    console.log('=== Test 3: Query "Carlos Ulberg Dominick Reyes" ===');
    getJson({
      q: "Carlos Ulberg Dominick Reyes",
      location: "austin, texas, united states",
      api_key: "7d8cc6a290cb006c8345fd50051a6b2a0c884d4e22cfdc6d15a4d9eb652eece9"
    }, (json3) => {
      console.log('Sports Results:');
      console.log(JSON.stringify(json3["sports_results"], null, 2));
      console.log('\n');

      // Test 4: Past fight result
      console.log('=== Test 4: Query "Jimmy Crute Ivan Erslan UFC" ===');
      getJson({
        q: "Jimmy Crute Ivan Erslan UFC",
        location: "austin, texas, united states",
        api_key: "7d8cc6a290cb006c8345fd50051a6b2a0c884d4e22cfdc6d15a4d9eb652eece9"
      }, (json4) => {
        console.log('Sports Results:');
        console.log(JSON.stringify(json4["sports_results"], null, 2));
        console.log('\nKnowledge Graph:');
        console.log(JSON.stringify(json4["knowledge_graph"], null, 2));
        console.log('\n=== All Tests Complete ===');

        // Look for fight results in any structure
        console.log('\n=== Searching for fight result data ===');
        const allData = { json, json2, json3, json4 };

        Object.keys(allData).forEach(key => {
          const data = allData[key];
          if (data.game_spotlight) {
            console.log(`Found game_spotlight in ${key}:`, JSON.stringify(data.game_spotlight, null, 2));
          }
          if (data.organic_results) {
            console.log(`Found ${data.organic_results.length} organic results in ${key}`);
          }
        });
      });
    });
  });
});
