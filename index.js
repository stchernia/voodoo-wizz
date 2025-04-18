const express = require('express');
const bodyParser = require('body-parser');
const { Op } = require('sequelize');
const axios = require('axios');
const db = require('./models');
const { CANTOPEN } = require('sqlite3');

const app = express();

app.use(bodyParser.json());
app.use(express.static(`${__dirname}/static`));

app.get('/api/games', (req, res) => db.Game.findAll()
  .then(games => res.send(games))
  .catch((err) => {
    console.log('There was an error querying games', JSON.stringify(err));
    return res.send(err);
  }));

app.post('/api/games', (req, res) => {
  const { publisherId, name, platform, storeId, bundleId, appVersion, isPublished } = req.body;
  return db.Game.create({ publisherId, name, platform, storeId, bundleId, appVersion, isPublished })
    .then(game => res.send(game))
    .catch((err) => {
      console.log('***There was an error creating a game', JSON.stringify(err));
      return res.status(400).send(err);
    });
});

app.delete('/api/games/:id', (req, res) => {
  // eslint-disable-next-line radix
  const id = parseInt(req.params.id);
  return db.Game.findByPk(id)
    .then(game => game.destroy({ force: true }))
    .then(() => res.send({ id }))
    .catch((err) => {
      console.log('***Error deleting game', JSON.stringify(err));
      res.status(400).send(err);
    });
});

app.put('/api/games/:id', (req, res) => {
  // eslint-disable-next-line radix
  const id = parseInt(req.params.id);
  return db.Game.findByPk(id)
    .then((game) => {
      const { publisherId, name, platform, storeId, bundleId, appVersion, isPublished } = req.body;
      return game.update({ publisherId, name, platform, storeId, bundleId, appVersion, isPublished })
        .then(() => res.send(game))
        .catch((err) => {
          console.log('***Error updating game', JSON.stringify(err));
          res.status(400).send(err);
        });
    });
});

app.post('/api/games/search', (req, res) => {
  const platform = req.body.platform.trim();
  const name = req.body.name.trim();
  const where = {};
  if (platform) {
    where.platform = platform;
  }
  if (name) {
    where.name = {
      [Op.like]: `%${name}%`,
    };
  }
  return db.Game.findAll({ where }).then(games => res.send(games))
    .catch((err) => {
      console.log('There was an error querying games', JSON.stringify(err));
      return res.send(err);
    });
});

app.post('/api/games/populate', (req, res) => {
  Promise.all([
    axios.get('https://interview-marketing-eng-dev.s3.eu-west-1.amazonaws.com/ios.top100.json'),
    axios.get('https://interview-marketing-eng-dev.s3.eu-west-1.amazonaws.com/android.top100.json'),
  ])
    .then(([iosResponse, androidResponse]) => {
      const deduplicate = (games) => {
        const set = new Set();
        return games.filter(game => {
          const appId = game.app_id;
          if (!appId || set.has(appId)) {
            return false;
          }
          set.add(appId);
          return true;
        });
      };

      const iosGames = deduplicate(iosResponse.data.flat()).slice(0, 100);
      const androidGames = deduplicate(androidResponse.data.flat()).slice(0, 100);

      const games = [...iosGames, ...androidGames].map(game => ({
        publisherId: game.publisher_id,
        name: game.humanized_name,
        platform: game.os,
        storeId: game.app_id,
        bundleId: game.bundle_id,
        appVersion: game.version,
        isPublished: true,
      }));

      return db.Game.bulkCreate(games);
    })
    .then(games => res.send(games))
    .catch((error) => {
      console.error('Failed to populate games', error);
      res.status(500).send({ error: 'Failed to populate games', details: error.message });
    });
});

app.listen(3000, () => {
  console.log('Server is up on port 3000');
});

module.exports = app;
