import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fixImports(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dir, file.name);

    if (file.isDirectory()) {
      fixImports(fullPath);
    } else if (file.name.endsWith(".js")) {
      let content = fs.readFileSync(fullPath, "utf8");

      // Replace relative imports without .js extension
      content = content.replace(
        /from\s+['"](\.\/.+?)(?<!\.js)['"]/g,
        "from '$1.js'",
      );

      content = content.replace(
        /import\s+['"](\.\/.+?)(?<!\.js)['"]/g,
        "import '$1.js'",
      );

      fs.writeFileSync(fullPath, content);
    }
  }
}

// Fix imports in the dist directory
const distDir = path.join(__dirname, "../dist");
if (fs.existsSync(distDir)) {
  fixImports(distDir);
  console.log("✅ Import extensions fixed!");
} else {
  console.log("❌ Dist directory not found");
}
