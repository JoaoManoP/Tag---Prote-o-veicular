const app = require("./app.json");

module.exports = {
  ...app.expo,
  plugins: [...(app.expo.plugins || []), "@maplibre/maplibre-react-native"],
};
