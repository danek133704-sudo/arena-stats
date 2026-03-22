const express = require('express');
const app = express();
app.use(express.json());

let stats = [];
let id = 1;

app.post('/api/stats', (req,res)=>{
    const stat = {...req.body, id:id++, verified:false, date:new Date()};
    stats.push(stat);
    res.json({success:true});
});

app.get('/api/stats/all', (req,res)=>{
    res.json(stats);
});

app.put('/api/stats/:id/verify', (req,res)=>{
    const stat = stats.find(s=>s.id==req.params.id);
    if(stat){ stat.verified=true; res.json({success:true}); }
    else res.status(404).end();
});

app.delete('/api/stats/:id', (req,res)=>{
    stats = stats.filter(s=>s.id!=req.params.id);
    res.json({success:true});
});

app.listen(3000, ()=>console.log('Server started'));
