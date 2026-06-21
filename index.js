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
    const likedRecipesCollection = db.collection("likedRecipes");
    const favouritesCollection = db.collection("favourites");
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });

    // ------------- Recipes Related APIs -------------

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

    app.get("/api/recipes/my/:authorId", async (req, res) => {
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

    app.post("/api/recipes", async (req, res) => {
      const recipe = req.body;
      const newRecipe = await recipesCollection.insertOne(recipe);
      res.json(newRecipe);
    });

    // Patch API of recipes

    app.patch("/api/recipe/:id", async (req, res) => {
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

    app.patch("/api/like/recipe/:recipeId", async (req, res) => {
      try {
        const { recipeId } = req.params;
        const likedPayload = req.body;

        // 🛑 অত্যন্ত গুরুত্বপূর্ণ: ফিল্টার করার সময় নিশ্চিত করতে হবে আমরা সঠিক
        // recipeId এবং userId দিয়ে খুঁজছি এবং প্রয়োজনে ObjectId-তে কনভার্ট করছি।
        const likeQuery = {
          recipeId: likedPayload.recipeId, // ফ্রন্টএন্ড থেকে আসা রেসিপি আইডি
          userId: likedPayload.userId, // ফ্রন্টএন্ড থেকে আসা ইউজার আইডি
        };

        // ১. চেক করা হচ্ছে ঠিক এই নির্দিষ্ট ইউজার এই নির্দিষ্ট রেসিপিতে লাইক দিয়েছে কি না
        const existingLike = await likedRecipesCollection.findOne(likeQuery);

        // রেসিপি কালেকশনের ফিল্টার (যেখানে কাউন্ট কমবে বা বাড়বে)
        const recipeFilter = { _id: new ObjectId(recipeId) };

        if (existingLike) {
          // 💔 ইউজার অলরেডি লাইক দিয়েছে -> শুধুমাত্র এই ইউজারের লাইকটিই ডিলিট হবে
          await likedRecipesCollection.deleteOne(likeQuery);

          // রেসিপির লাইক কাউন্ট ১ কমিয়ে দাও (-1)
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
          // ❤️ ইউজার আগে লাইক দেয়নি -> নতুন লাইক যোগ হবে
          await likedRecipesCollection.insertOne(likedPayload);

          // রেসিপির লাইক কাউন্ট ১ বাড়িয়ে দাও (+1)
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
    // Delete API of recipes

    app.delete("/api/myRecipe/:id", async (req, res) => {
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
    // ব্যাকএন্ড: Server.js
    app.get("/api/my-recipes-likes/:userId", async (req, res) => {
      const { userId } = req.params;

      // প্রথমে ওই ইউজারের সব রেসিপি আইডি বের করো
      const myRecipes = await recipesCollection
        .find({ authorId: userId })
        .toArray();
      const myRecipeIds = myRecipes.map((r) => r._id.toString());

      // ওই রেসিপি আইডিগুলোতে মোট কতগুলো লাইক পড়েছে তা কাউন্ট করো
      const totalLikes = await likedRecipesCollection.countDocuments({
        recipeId: { $in: myRecipeIds },
      });

      res.json(totalLikes);
    });

    // --------------- favourites Related APIs ---------------

    // 🔍 নির্দিষ্ট ইউজারের সকল ফেভারিট রেসিপি পাওয়ার জন্য
    app.get("/api/favorites", async (req, res) => {
      const { userId } = req.query; // req.query ব্যবহার করতে হবে

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      const favorites = await favouritesCollection
        .find({ authorId: userId })
        .toArray();
      res.json(favorites);
    });

    // Server.js বা তোমার রাউট ফাইল
    app.post("/api/add-favourite", async (req, res) => {
      try {
        const { userId, recipeId } = req.body;

        // ১. চেক করো অলরেডি আছে কি না
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

        // ২. শুধুমাত্র প্রয়োজনীয় ডাটা সেভ করো, পুরো req.body নয় (নিরাপত্তার জন্য ভালো)
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
