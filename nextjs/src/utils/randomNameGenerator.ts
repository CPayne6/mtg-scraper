const adjectives = [
  "Autumn", "Hidden", "Bitter", "Misty", "Silent", "Empty", "Dry", "Dark", "Summer", "Icy",
  "Delicate", "Quiet", "White", "Cool", "Spring", "Winter", "Patient", "Twilight", "Dawn",
  "Crimson", "Wispy", "Weathered", "Blue", "Billowing", "Broken", "Cold", "Damp", "Falling",
  "Frosty", "Green", "Long", "Late", "Lingering", "Bold", "Little", "Morning", "Muddy", "Old",
  "Red", "Rough", "Still", "Small", "Sparkling", "Wandering", "Withered", "Wild", "Black",
  "Young", "Holy", "Solitary", "Fragrant", "Aged", "Snowy", "Proud", "Floral", "Restless",
  "Divine", "Polished", "Ancient", "Purple", "Lively", "Nameless"];
const nouns = [
  "Waterfall", "River", "Breeze", "Moon", "Rain", "Wind", "Sea", "Morning", "Snow", "Lake",
  "Sunset", "Pine", "Shadow", "Leaf", "Dawn", "Glitter", "Forest", "Hill", "Cloud", "Meadow",
  "Sun", "Glade", "Bird", "Brook", "Butterfly", "Bush", "Dew", "Dust", "Field", "Fire",
  "Flower", "Firefly", "Feather", "Grass", "Haze", "Mountain", "Night", "Pond", "Darkness",
  "Snowflake", "Silence", "Sound", "Sky", "Shape", "Surf", "Thunder", "Violet", "Water",
  "Wildflower", "Wave", "Water", "Resonance", "Sun", "Wood", "Dream", "Cherry", "Tree", "Fog",
  "Frost", "Voice", "Paper", "Frog", "Smoke", "Star"];

  function getRandomItem<T>(arr: T[]){
    return arr[Math.floor(Math.random() * arr.length)]
  }

export function generateRandomName(){
  return getRandomItem(adjectives) + ' ' + getRandomItem(nouns)
}