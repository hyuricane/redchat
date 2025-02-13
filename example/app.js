const express = require('express')
const hbs = require('hbs')
const cookieParser = require('cookie-parser')
const createError = require('http-errors')
const path = require('path')
const session = require('express-session')
const { hash } = require('crypto')
const { RedChat } = require('../')


const redchat = new RedChat({
  client: new URL(process.env.REDIS_URL || 'redis://localhost:6379'),
  prefix: 'redchat',

  historyLimit: 10
})

const app = new express()
app.use(express.static(path.join(__dirname, '/public')))

// hbs.registerPartials(path.join(__dirname, '/views'), {
//   rename: function (name) {
//     console.log('[DEBUG] register partial', name, 'to', name.replace(/\W/g, '_'))
//     // all non-word characters replaced with underscores
//     return name.replace(/\W/g, '_')
//   }
// })
app.set('view engine', 'hbs')
// app.set('view options', { layouts: path.join(__dirname, '/views/layouts/index') })
app.set('hbs', hbs.__express)

// cookies
app.use(cookieParser())

// session
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false },
  store: new session.MemoryStore()
}))

// jsonbody
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// middlewares
function authMiddleware (req, res, next)  {
  if (req.session.name) {
    next()
  } else {
    res.redirect('/login')
  }
}

// routes
app.get('/', authMiddleware, (req, res) => {
  res.render('pages/index', {
    title: 'Home',
    user: req.session.name,
    layout: 'layouts/index'
  })
})

app.get('/login', (req, res) => {
  res.render('pages/login', {
    title: 'Login',
    layout: 'layouts/index'
  })
})
app.post('/login', (req, res) => {
  const { name } = req.body
  console.log('[DEBUG] login', name)
  req.session.name = name
  res.redirect('/')
})

app.post('/room', authMiddleware, (req, res) => {
  const {name} = req.body
  console.log('[DEBUG] room', name)
  res.redirect('/room/' + name)
})

app.get('/room/:name', authMiddleware, (req, res) => {
  const id = hash('sha1', req.session.name, 'base64')
  res.render('pages/room', {
    title: 'Room ' + req.params.name,
    userId: id,
    user: req.session.name,
    name: req.params.name
  })
})


// chat api

app.get('/_/room/:name', authMiddleware, async (req, res) => {
  const id = hash('sha1', req.session.name, 'base64')
  const agent = await redchat.createAgent(id, req.session.name)
  const room = await agent.join(req.params.name, (msg) => {
    const { type, ...rest } = msg
    res.write(`event: ${type}\ndata: ${JSON.stringify(rest)}\n\n`)
  }, 3600)
  // sse
  res.header('Content-Type', 'text/event-stream')
  res.header('Cache-Control', 'no-cache')
  res.header('Connection', 'keep-alive')
  res.header('Access-Control-Allow-Origin', '*')
  res.flushHeaders()
  const interval = setInterval(() => {
    res.write(': keepalive\n\n')
  }, 30000);

  // send chat histories
  agent.getMessages(room.name, 5).then(messages => {
    messages.forEach(msg => {
      const { type, ...rest } = msg
      res.write(`event: ${type}\ndata: ${JSON.stringify(rest)}\n\n`)
    })
  })
  req.on('close', () => {
    agent.leave(room.name)
    clearInterval(interval)
    res.end()
  })
})
app.post('/_/room/:name', authMiddleware, async (req, res) => {
  const {message} = req.body
  console.log('[DEBUG] message', message)
  const id = hash('sha1', req.session.name, 'base64')
  const agent = await redchat.createAgent(id, req.session.name)
  await agent.sendMessage(req.params.name, message)
  res.json({
    status: 'ok'
  })
})

// handle 404
app.use(function (req, res, next) {
  next(createError(404))
})

// handle errors
app.use(function (err, req, res, next) {
  if (err.status === 404) {
    res.status(404).render('pages/404', {
      title: '404',
      path: req.path
    })
    return
  }
  console.error(err.stack)
})

const port = parseInt(process.env.PORT) || 8080
app.listen(port, () => {
  console.log('[INFO] listening to port:', port)
})