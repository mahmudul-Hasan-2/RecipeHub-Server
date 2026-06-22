const dotenv = require("dotenv");
dotenv.config();
const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { jwtVerify, createRemoteJWKSet } = require("jose-cjs");
const uri = process.env.MONGODB_URI;

app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_URL,
  }),
);

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
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
    const likedRecipesCollection = db.collection("likedRecipes");
    const favouritesCollection = db.collection("favourites");
    const usersCollection = db.collection("user");
    const transactionsCollection = db.collection("transactions");
    const reportsCollection = db.collection("reports");
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });

    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers?.authorization;
      console.log(authHeader);
      if (!authHeader) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const token = authHeader.split(" ")[1];
      console.log("Token", token);
      if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      try {
        console.log("Inside Try Block!");
        const { payload } = await jwtVerify(token, JWKS);
        console.log("payload", payload);
        next();
      } catch (error) {
        console.log(error);
        res.status(401).json({ message: "Unauthorized" });
      }
    };

    // ------------- Recipes Related APIs -------------

    app.get("/api/recipes/counts", verifyToken, async (req, res) => {
      const recipes = await recipesCollection.countDocuments({});
      res.json(recipes);
    });

    app.get("/api/recipes/featured", async (req, res) => {
      const filter = {
        isFeatured: true,
      };
      const featuredRecipes = await recipesCollection.find(filter).toArray();
      res.json(featuredRecipes || []);
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

    app.get("/api/allRecipes", verifyToken, async (req, res) => {
      const recipes = await recipesCollection.find({}).toArray();
      res.json(recipes);
    });

    app.get("/api/recipes/:recipeId", verifyToken, async (req, res) => {
      const recipeId = await req.params.recipeId;
      const recipe = await recipesCollection.findOne({
        _id: new ObjectId(recipeId),
      });
      res.json(recipe);
    });

    app.get("/api/recipes/my/:authorId", verifyToken, async (req, res) => {
      const authorId = req.params.authorId;

      const recipes = await recipesCollection
        .find({
          authorId: authorId,
        })
        .toArray();
      res.json(recipes);
    });

    app.get("/api/most-liked/recipes", async (req, res) => {
      const recipes = await recipesCollection
        .find({})
        .sort({ likesCount: -1 })
        .limit(6)
        .toArray();
      res.json(recipes);
    });

    // POST API of recipes

    app.post("/api/recipes", verifyToken, async (req, res) => {
      const recipe = req.body;
      const newRecipe = await recipesCollection.insertOne(recipe);
      res.json(newRecipe);
    });

    // Patch API of recipes

    app.patch("/api/recipe/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      console.log(id);
      const newRecipeData = req.body;
      console.log(newRecipeData);
      const filter = {
        _id: new ObjectId(id),
      };

      const updateDoc = {
        $set: newRecipeData,
      };

      const result = await recipesCollection.updateOne(filter, updateDoc);
      console.log(result);
      res.json(result);
    });

    app.patch("/api/like/recipe/:recipeId", verifyToken, async (req, res) => {
      try {
        const { recipeId } = req.params;
        const likedPayload = req.body;

        const likeQuery = {
          recipeId: likedPayload.recipeId,
          userId: likedPayload.userId,
        };

        const existingLike = await likedRecipesCollection.findOne(likeQuery);

        const recipeFilter = { _id: new ObjectId(recipeId) };

        if (existingLike) {
          await likedRecipesCollection.deleteOne(likeQuery);

          const updateDoc = { $inc: { likesCount: -1 } };
          const result = await recipesCollection.updateOne(
            recipeFilter,
            updateDoc,
          );

          return res.json({
            success: true,
            message: "Unliked successfully",
            result,
          });
        } else {
          await likedRecipesCollection.insertOne(likedPayload);

          const updateDoc = { $inc: { likesCount: 1 } };
          const result = await recipesCollection.updateOne(
            recipeFilter,
            updateDoc,
          );

          return res.json({
            success: true,
            message: "Liked successfully",
            result,
          });
        }
      } catch (error) {
        console.error("Error in like/unlike API:", error);
        res
          .status(500)
          .json({ success: false, error: "Internal Server Error" });
      }
    });

    app.patch(
      "/api/recipe/isFeatured/:recipeId",
      verifyToken,
      async (req, res) => {
        const { recipeId } = req.params;
        const isFeatured = req.body.isFeatured;

        const filter = {
          _id: new ObjectId(recipeId),
        };

        const updateDoc = {
          $set: { isFeatured: isFeatured },
        };

        const result = await recipesCollection.updateOne(filter, updateDoc);
        res.json(result);
      },
    );

    // Delete API of recipes

    app.delete("/api/myRecipe/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      console.log(id);
      const filter = {
        _id: new ObjectId(id),
      };

      const result = await recipesCollection.deleteOne(filter);
      res.json(result);
    });

    // ---------- All Likes Related APIs ----------

    app.get("/api/allLikes", async (req, res) => {
      const likedRecipes = await likedRecipesCollection.find({}).toArray();
      res.json(likedRecipes);
    });

    app.get("/api/my-recipes-likes/:userId", verifyToken, async (req, res) => {
      const { userId } = req.params;

      const myRecipes = await recipesCollection
        .find({ authorId: userId })
        .toArray();
      const myRecipeIds = myRecipes.map((r) => r._id.toString());

      const totalLikes = await likedRecipesCollection.countDocuments({
        recipeId: { $in: myRecipeIds },
      });

      res.json(totalLikes);
    });

    // --------------- favourites Related APIs ---------------

    app.get("/api/favorites", async (req, res) => {
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      const favorites = await favouritesCollection
        .find({ authorId: userId })
        .toArray();
      res.json(favorites);
    });

    app.post("/api/add-favourite", verifyToken, async (req, res) => {
      try {
        const { userId, recipeId } = req.body;

        const existing = await favouritesCollection.findOne({
          authorId: userId,
          recipeId: recipeId,
        });

        if (existing) {
          return res.status(400).json({
            success: false,
            message: "You have already bookmarked this recipe!",
          });
        }

        const favoriteDoc = {
          ...req.body,
          createdAt: new Date(),
        };

        const result = await favouritesCollection.insertOne(favoriteDoc);
        res.status(200).json({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
      }
    });

    app.delete("/api/favourite/:id", verifyToken, async (req, res) => {
      const { id } = req.params;

      const query = {
        _id: new ObjectId(id),
      };

      const result = await favouritesCollection.deleteOne(query);
      res.json(result);
    });

    // ------------- User Related APIs -------------

    app.get("/api/users/counts", verifyToken, async (req, res) => {
      const users = await usersCollection.find({}).toArray();
      res.json(users);
    });

    app.get("/api/users", verifyToken, async (req, res) => {
      const users = await usersCollection.find({}).toArray();
      res.json(users);
    });

    app.get("/api/users/premiums", verifyToken, async (req, res) => {
      const users = await usersCollection.countDocuments({ isPremium: true });
      res.json(users);
    });

    app.patch("/api/users/:userId", verifyToken, async (req, res) => {
      const { userId } = req.params;
      const { isPremium } = req.body;

      console.log(userId, isPremium);

      const filter = {
        _id: new ObjectId(userId),
      };

      const updateDoc = {
        $set: { isPremium: isPremium },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.json(result);
    });

    app.patch(
      "/api/users/update-status/:userId",
      verifyToken,
      async (req, res) => {
        const { userId } = req.params;
        const status = req.body.status;

        const query = {
          _id: new ObjectId(userId),
        };

        const updateDoc = {
          $set: { isBlocked: status },
        };

        const result = await usersCollection.updateOne(query, updateDoc);
        res.json(result);
      },
    );

    // ------------- Transactions Related APIs -------------

    app.get("/api/transactions/:userId", verifyToken, async (req, res) => {
      const { userId } = req.params;
      const query = { userId: userId };
      const transactions = await transactionsCollection.find(query).toArray();
      res.json(transactions);
    });

    app.post("/api/transaction", verifyToken, async (req, res) => {
      const transaction = req.body;

      const newTransaction =
        await transactionsCollection.insertOne(transaction);
      res.json(newTransaction);
    });

    // ------------- Reports Related APIs -------------
    app.get("/api/reports/counts", verifyToken, async (req, res) => {
      const reports = await reportsCollection.countDocuments({});
      res.json(reports);
    });

    app.get("/api/reports", verifyToken, async (req, res) => {
      const reports = await reportsCollection.find({}).toArray();
      res.json(reports);
    });

    app.post("/api/report", verifyToken, async (req, res) => {
      const report = req.body;
      const newReport = await reportsCollection.insertOne(report);
      res.json(newReport);
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
