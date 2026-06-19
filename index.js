const dotenv = require("dotenv");
dotenv.config();
const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.MONGODB_URI;

app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_URL,
  }),
);

app.get("/", (req, res) => {
  res.json({ message: "Welcome to Recipehub Server!", status: "success" });
});

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("recipehub");
    const recipesCollection = db.collection("recipes");
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });

    // Recipes Related APIs

    app.get("/api/recipes/featured", async (req, res) => {
      const filter = {
        isFeatured: true,
      };
      const featuredRecipes = await recipesCollection.find(filter).toArray();
      res.json(featuredRecipes);
    });
    app.get("/api/recipes", async (req, res) => {
      try {
        const page = Number(req.query.page) || 1;
        const perPage = Number(req.query.perPage) || 12;
        const skip = (page - 1) * perPage;

        const { search, category, cuisine } = req.query;

        let filterQuery = {};

        if (search) {
          filterQuery.recipeName = { $regex: search, $options: "i" };
        }
        if (category) {
          filterQuery.category = { $in: [category] };
        }
        if (cuisine) {
          filterQuery.cuisineType = { $in: [cuisine] };
        }

        const recipes = await recipesCollection
          .find(filterQuery)
          .skip(skip)
          .limit(perPage)
          .toArray();

        const totalRecipes =
          await recipesCollection.countDocuments(filterQuery);
        const totalPages = Math.ceil(totalRecipes / perPage);

        res.json({
          recipes,
          totalPages,
          totalRecipes,
        });
      } catch (error) {
        console.error("Database Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.get("/api/recipes/:recipeId", async (req, res) => {
      const recipeId = await req.params.recipeId;
      const recipe = await recipesCollection.findOne({
        _id: new ObjectId(recipeId),
      });
      res.json(recipe);
    });

    app.get("/api/recipes/:authorId", async (req, res) => {
      const { authorId } = req.params;

      const filter = {
        authorId: authorId,
      };

      const recipes = await recipesCollection.find(filter).toArray();
      res.json(recipes);
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
