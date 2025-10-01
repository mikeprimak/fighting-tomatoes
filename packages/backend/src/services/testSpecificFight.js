/**
 * Test SerpAPI with specific fight queries that might trigger detailed results box
 */

const { getJson } = require("serpapi");

console.log('Testing specific fight queries for detailed results\n');

// Test different query formats for the Crute vs Erslan fight
const queries = [
  "Jimmy Crute vs Ivan Erslan",
  "Jimmy Crute Ivan Erslan September 28 2025",
  "Jimmy Crute defeats Ivan Erslan",
  "Crute Erslan UFC Perth",
  "UFC Perth September 28 2025 results",
  "Carlos Ulberg vs Dominick Reyes result",
  "Ulberg Reyes UFC Perth result",
];

let currentIndex = 0;

function testNextQuery() {
  if (currentIndex >= queries.length) {
    console.log('\n=== All queries complete ===\n');
    console.log('Summary: Looking for fight results with winner, method, round, and time...\n');
    return;
  }

  const query = queries[currentIndex];
  console.log(`\n=== Query ${currentIndex + 1}/${queries.length}: "${query}" ===`);

  getJson({
    engine: "google",
    q: query,
    location: "austin, texas, united states",
    api_key: "7d8cc6a290cb006c8345fd50051a6b2a0c884d4e22cfdc6d15a4d9eb652eece9"
  }, (json) => {
    // Check for various result structures
    console.log('\nSports Results:', json["sports_results"] ? 'Found' : 'Not found');
    if (json["sports_results"]) {
      console.log(JSON.stringify(json["sports_results"], null, 2));
    }

    console.log('Game Spotlight:', json["game_spotlight"] ? 'Found' : 'Not found');
    if (json["game_spotlight"]) {
      console.log(JSON.stringify(json["game_spotlight"], null, 2));
    }

    console.log('Knowledge Graph:', json["knowledge_graph"] ? 'Found' : 'Not found');
    if (json["knowledge_graph"]) {
      const kg = json["knowledge_graph"];
      console.log('- Title:', kg.title);
      console.log('- Type:', kg.type);

      // Look for fight result data
      if (kg.result || kg.winner || kg.method) {
        console.log('*** FOUND RESULT DATA IN KNOWLEDGE GRAPH ***');
        console.log(JSON.stringify(kg, null, 2));
      }
    }

    // Check answer box
    console.log('Answer Box:', json["answer_box"] ? 'Found' : 'Not found');
    if (json["answer_box"]) {
      console.log(JSON.stringify(json["answer_box"], null, 2));
    }

    // Check related results
    if (json["related_results"]) {
      console.log('Related Results:', json["related_results"].length, 'items');
    }

    // Small delay before next query
    setTimeout(() => {
      currentIndex++;
      testNextQuery();
    }, 1000);
  });
}

// Start testing
testNextQuery();
