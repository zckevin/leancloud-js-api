// split leancloud backup file into N segments and then do the import

const fs = require("fs")

const N = 3;

const filePath = process.argv[2]
const blob = fs.readFileSync(filePath)

const lines = blob.toString().split("\n").filter(line => {
  return line.startsWith("{")
})

const total = lines.length
let chunks = []

while (lines.length > 0) {
  const chunk = lines.splice(0, Math.ceil(total / N))
  chunks.push(chunk)
}

chunks.map((chunk, index) => {
  const jsonBlob = `[${chunk.join(",")}]`
  fs.writeFileSync(`chunk.${index}.json`, jsonBlob)
})
