const chai = require('chai');
const chaiHttp = require('chai-http');
const auth = require('../auth');

const mongoose = require('mongoose');
const User = require('../models')

const should = chai.should();
const expect = chai.expect;
const assert = chai.assert;

const {app, runServer, closeServer} = require('../server');
const {TEST_DATABASE_URL} = require('../config');
chai.use(chaiHttp);


// generate an object representing a user.
// can be used to generate seed data for db
// or request.body data
function seedUserData() {
  console.info('seeding User data');
  const dummyUsers = [
    {"user":{
        "username": 'user40',
        "email": "tesseluser40@gmail.com",
        "password": "abcd1234"
      }
    },
    {"user":{
        "username": 'bigdaddy',
        "email": "tesselpapatessel@gmail.com",
        "password": "efgh5678"
      }
    },
    {"user":{
        "username": 'thetesselation',
        "email": "tesselthetesselation@gmail.com",
        "password": "ijkl9101112"
      }
    }
  ]
  dummyUsers.forEach(function(User){
    let payload = auth.encrypt(User);
      return chai.request(app)
        .post('/users')
        .set("Content-Type", "application/json")
        .send({"payload":payload})
        .then((res) => console.info("seeded user: ", res.body.user.username));
  });
}

// this function deletes the entire database.
// we'll call it in an `afterEach` block below
// to ensure data from one test does not stick
// around for next one
function tearDownDb() {
    console.warn('Deleting database');
    return mongoose.connection.dropDatabase();
}

describe('Tessellated Security API', function() {
  
  before(function() {
    return runServer(TEST_DATABASE_URL);
  });

  before(function() {
    return seedUserData();
  });

  after(function() {
    return tearDownDb();
  });

  after(function() {
     return closeServer();
  })

  describe('Users', function(){
    const dummyUser = {
      "user":{
        "username": "scooby", 
        "email": "greatEmail@aol.com", 
        "password": "1234"
      }
    };
    let authenticatedToken;
    let deviceTokenTestDelete; 
    it('POST endpoint: a new user should be able to create an account', function(){
    let payload = auth.encrypt(dummyUser);  
      
      return chai.request(app)
        .post('/users')
        .set("Content-Type", "application/json")
        .send({payload: payload})
        .then(function(res){
          res.should.have.status(201);
          res.body.should.be.a('object');
          res.body.user.username.should.equal(dummyUser.user.username);
          res.body.user.email.should.equal(dummyUser.user.email);
    
          return User.findOne({username:dummyUser.user.username})
        })
        .then(function(_user){
          expect(_user.validPassword(dummyUser.user.password,_user)).to.be.true;
        })
        .catch(function(err){
          console.log(err);
        })
    });
    it('POST endpoint: an already registered user should NOT be able create an account under the same username', function(){
       let duplicativeUser = 
       { "user":{
            "username": "user40",
            "email": "tesseluser40@gmail.com",
            "password": "abcd1234"
        }
      };
      errorCheck = {
        name:"ValidatorError",
        kind: "unique"
      }

      let payload = auth.encrypt(duplicativeUser);
        return chai.request(app)
          .post('/users')
          .set("Content-Type", "application/json")
          .send({payload:payload})
          .catch(function(err){
            error = JSON.parse(err.response.error.text);
           //should assertions testing that an already registered user cannot make an account
            err.should.have.status(500);
            error.errors.email.name.should.equal(errorCheck.name);
            error.errors.email.kind.should.equal(errorCheck.kind);
            error.errors.email.path.should.equal("email");
            error.errors.email.value.should.equal(duplicativeUser.user.email);
            error.errors.username.name.should.equal(errorCheck.name);
            error.errors.username.kind.should.equal(errorCheck.kind);
            error.errors.username.path.should.equal("username");
            error.errors.username.value.should.equal(duplicativeUser.user.username);
            error.name.should.equal('ValidationError');
          });
        
    });
    it('POST endpoint: a user should be able to log in', function(){
      //find user
      let user =  {
        user: {
          username: 'user40',
          password: "abcd1234"
        }
      }
      //this is the token that encrypts the credentials sent from client to server over the wire
      let tokenPayload = auth.encrypt(user);
      return chai.request(app)
        .post('/users/login')
        .set("Content-Type", "application/json")
        .send({payload:tokenPayload})
        .then(function(res){
          
          //this is an authentication token that gets created after we've successfully logged in, will be reused in protected endpoint tests for testing when a user is logged in
          authenticatedToken = res.body.user.token;
          //make more assertions, confirm username, email, and token are all being sent
          res.body.user.email.should.equal("tesseluser40@gmail.com");
          res.body.user.token.should.be.a('string');
          res.body.user.username.should.equal(user.user.username);
          //decrypt the token and see what's in there, any good assertions to be made there?
          decryptedResponseToken = auth.jwt.verify(res.body.user.token, auth.secret);
          //.exp is when the token expires while .iat is when the token was created, exp should be larger (come after) than iat
          expect(decryptedResponseToken.exp).to.be.above(decryptedResponseToken.iat);
        })
    });
    it("PUT endpoint: a user needs to be able to update one's username, email, or password to new credentials", function(){
      
      let userNewCredentials =  {
          username: 'user40new',
          password: "abcd1234new",
          email: "tesseluser40new@gmail.com"
        }

      //this is the token that encrypts the credentials sent from client to server over the wire
      let user = auth.jwt.verify(authenticatedToken, auth.secret);
      //chai request to initially change the user's credentials to new ones
      return chai.request(app)
        .put(`/user/${user.id}`)
        .set("Authorization", `Bearer ${authenticatedToken}`)
        .send({user:userNewCredentials})
        .then(function(res){
          res.should.have.status(201);
          return User.findById(user.id).exec();
        })
        .then(function(_user){
          //make more assertions, confirm username, email, and token are all being sent
          _user.email.should.equal(userNewCredentials.email);
          _user.username.should.equal(userNewCredentials.username);
          expect(_user.validPassword(userNewCredentials.password, _user)).to.be.true;
        });
    });
    it("PUT endpoint: a user needs to be able to update one's username, email, or password to old credentials", function(){
      let userOldCredentials = {
          username: 'user40',
          password: "abcd1234",
          email: "tesseluser40@gmail.com"
        }
      //this is the token that encrypts the credentials sent from client to server over the wire
      let user = auth.jwt.verify(authenticatedToken, auth.secret);

        //chai request to finally change the the user's credentials back to the old ones
        return chai.request(app)
          .put(`/user/${user.id}`)
          .set("Authorization", `Bearer ${authenticatedToken}`)
          .send({user:userOldCredentials})
          .then(function(res){
            res.should.have.status(201);
            return User.findById(user.id).exec();
          })
          .then(function(_user){
            //make more assertions, confirm username, email, and token are all being sent
            _user.email.should.equal(userOldCredentials.email);
            _user.username.should.equal(userOldCredentials.username);
            expect(_user.validPassword(userOldCredentials.password, _user)).to.be.true;
          }); 
    });

    it("DELETE endpoint: a user needs to be able to delete a user account", function(){
      let user = auth.jwt.verify(authenticatedToken, auth.secret);
      return chai.request(app)
        .delete(`/user/${user.id}`)
        .set("Authorization", `Bearer ${authenticatedToken}`)
        .then(function(res){
          res.should.have.status(204);
          return User.findById(user.id).exec();        
        })
        .then(function(_user){
          should.not.exist(_user);
        });
    });
  });
});


