const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const db = require("./db");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BACKEND_URL}/auth/google/callback`,
    },
    (accessToken, refreshToken, profile, done) => {
      const user = {
        id: profile.id,
        name: profile.displayName,
        email: profile.emails[0].value,
      };
      // db.run(
      //   `INSERT OR REPLACE INTO users (id, name, email) VALUES (?, ?, ?)`,
      //   [user.id, user.name, user.email],
      //   (err) => {
      //     if (err) return done(err);
      //     return done(null, user);
      //   }
      //);
      return done(null, user);
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  db.get(`SELECT * FROM users WHERE id = ?`, [id], (err, user) => {
    done(err, user);
  });
});

module.exports = passport;