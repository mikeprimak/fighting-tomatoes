/**
 * Test using Knowledge Graph ID (kgmid) to get detailed fight results
 */

const { getJson } = require("serpapi");

console.log('Testing SerpAPI with Knowledge Graph ID for UFC Fight Night: Ulberg vs Reyes\n');

// The kgmid we found: /g/11x65x8sgd
console.log('=== Test: Using kgmid /g/11x65x8sgd with query ===');
getJson({
  engine: "google",
  q: "UFC Fight Night Ulberg vs Reyes",
  kgmid: "/g/11x65x8sgd",
  location: "austin, texas, united states",
  api_key: "7d8cc6a290cb006c8345fd50051a6b2a0c884d4e22cfdc6d15a4d9eb652eece9"
}, (json) => {
  console.log('\n=== Full Response ===');
  console.log(JSON.stringify(json, null, 2));

  console.log('\n=== Sports Results ===');
  console.log(JSON.stringify(json["sports_results"], null, 2));

  console.log('\n=== Game Spotlight ===');
  console.log(JSON.stringify(json["game_spotlight"], null, 2));

  console.log('\n=== Knowledge Graph ===');
  console.log(JSON.stringify(json["knowledge_graph"], null, 2));
});
