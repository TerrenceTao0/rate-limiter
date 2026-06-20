async function spam() {
  const url = "http://localhost:3000/api/get-resource";

  const promises = [];

  for (let i = 0; i < 100; i++) {
    promises.push(fetch(url).then(r => r.status));
  }

  const results = await Promise.all(promises);

  console.log("done", results);
}


spam();

