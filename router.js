require('dotenv').config();
const bodyParser = require('body-parser');

const express = require('express');
const router = express.Router();
router.use(bodyParser.json());

const passport = require('./passport');

const User = require('./models');
const auth = require('./auth');

Array.min = function (array) {
  return Math.min.apply(Math, array);
}

//put this in server, placed before pulling in or declaring any routes to all cross origin requests
router.all('*', function(req, res, next) {
    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, Authorization');
    res.header('Access-Control-Expose-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });


router.use( (err,req,res,next) => {
  if (err.name === 'ValidationError'){
    return res.status(422).json({
      errors: Object.keys(err.errors).reduce((errors,key) => {
        errors[key] = err.errors[key].message;

        return errors;
      }, {})
    });
  }
  return next(err);
});


/*
request body from form needs to be in this format:

{
  "user": {
    "username": "pudgyBear",
    "email": "jake@example.com".
    "password": "mypasswordisjake"
  }
}
*/

// //endpoint to test deployed server
// router.get("/", (req,res,next) => {
//   res.status(200).json({test: "working!"});
// });

//endpoint creating new users i.e. registering with the site
router.post('/users', auth.decrypt, (req,res,next) => {
  let user = new User();
  user.username = req.body.user.username;
  user.email = req.body.user.email;
  user.setPassword(req.body.user.password);
  user.save()
  .then(() => res.status(201).json({user: user.toAuthJSON()}))
  .catch(err => res.status(500).send(err));
});

//endpoint for logging into a user's profile
router.post('/users/login', auth.decrypt, (req,res,next) => {
    if(!req.body.user.username){
    return res.status(422).json({errors: {username: "can't be blank"}});
  }

  if(!req.body.user.password){
    return res.status(422).json({errors: {password: "can't be blank"}});
  }

  passport.authenticate("local", {session: false},  (err,user,info) => {
    if(err){ return next(err);}
    if(user){
      //authorization token
      user.token = user.generateJWT();
      
      return res.status(201).json({user: user.toAuthJSON()});
    } 
    else {
      return res.status(422).json(info);
    }
  })(req,res,next);
});

//endpoint to get the user's auth payload from their token
router.get('/user/:ID', auth.required, (req,res,next) => {
  User.findById(req.params.ID).then((user)=>{
    if(!user){ return res.sendStatus(401); }

    return res.json({user: user.toAuthJSON()});
  }).catch(next);
});

//endpoint to update user
router.put('/user/:ID', auth.required, (req,res,next)=>{
  User.findById(req.params.ID).then((user)=>{
    if(!user){ return res.sendStatus(401); }
    
    //to only update fields that were passed
    if(typeof req.body.user.username !=="undefined"){
      user.username = req.body.user.username;
    }
    if(typeof req.body.user.email !=="undefined"){
      user.email = req.body.user.email;
    }
    if(typeof req.body.user.password !=="undefined"){
      user.setPassword(req.body.user.password);
    }

    return user.save().then( ()=>res.status(201).json({user: user.toAuthJSON()}))
  }).catch(next);
});

//endpoint to delete a user
router.delete('/user/:ID', auth.required, (req,res,next)=>{
    User.findByIdAndRemove(req.params.ID).then((user)=>{
      if(!user){ return res.sendStatus(401); }

      return user.save().then(()=> {
        return res.status(204).json({user: user.toAuthJSON()});
    });
  })
  .catch(next);
});

//endpoint to get recent searches
router.get('/user/:ID/annotations', auth.required, (req,res,next)=>{
  return User.findById(req.params.ID)
    .then((user)=>{
      if(!user){ return res.sendStatus(401); }
      return res.json({annotations:user.toAuthAnnotationsJSON()});
    });
});

//endpoint to post new annotations to the database
router.post('/user/:ID/annotations', auth.required, (req,res,next)=>{
  let annotations;
  let oldestAnnotation;
  return User.findById(req.params.ID)
  .then((user)=>{
    if(!user){ return res.sendStatus(401); }
    
    let annotation = user.annotations.create({
      annotation:req.body.annotation    
    });
    
    user.annotations.addToSet(annotation);
    annotations = user.annotations;
    return user
      .save().then( () =>{
        //find oldest entry
        let annotationsNumberArray = annotations.map((annotation) => {
          return annotation.dateCreated
        });
        //console.log("annotationsNumberArray", annotationsNumberArray);
        let min = Array.min(annotationsNumberArray)
        oldestAnnotation = annotations.find(annotation => {
          return annotation.dateCreated === min;
        });
        //console.log("oldestAnnotation: ",oldestAnnotation);
        //then get the right user back
        return User.findById(req.params.ID)
          .then((user)=>{
            //if there are more than 10 annotations
            if (user.annotations.length > 10) {
              //remove the oldest annotation
              return user.annotations.id(oldestAnnotation._id).remove().then( () =>{
                //and save it
                return user.save().then((user)=>{
                    //and send the response with the updated list
                    return res.status(201).json({annotations:user.toAuthAnnotationsJSON(),oldestAnnotationRemoved:user.toAuthOldestAnnotationJSON(oldestAnnotation)});
                  });
              });
            }
            //else just send the response with the list that is 10 or less
            else {
              return res.status(201).json({annotations:user.toAuthAnnotationsJSON()});
            }
        }) 
    });
  })
  .catch(next);
});
//endpoint to clear (delete) annotations
router.delete('/user/:ID/annotations', auth.required, (req,res,next)=>{
  return User.findById(req.params.ID)
    .then((user)=>{
      if(!user){ return res.sendStatus(401); }
      user.annotations = [];
      return user.save().then((user)=>{
        return res.status(204).send();
      });
    })
    .catch(next);
});


module.exports = router;
