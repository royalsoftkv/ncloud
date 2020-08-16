module.exports = {

    debugStreamEvents(stream) {
        stream.on('data',()=>{
            console.log('stream:data');
        });
        stream.on('end',()=>{
            console.log('stream:end');
        });
        stream.on('error',(error)=>{
            console.log('stream:error',error);
        });
        stream.on('close',()=>{
            console.log('stream:close');
        });
        stream.on('readable',()=>{
            console.log('stream:readable');
        });
        stream.on('drain',()=>{
            console.log('stream:drain');
        });
        stream.on('finish',()=>{
            console.log('stream:finish');
        });
        stream.on('close',()=>{
            console.log('stream:close');
        });
        stream.on('pipe',()=>{
            console.log('stream:pipe');
        });
        stream.on('unpipe',()=>{
            console.log('stream:unpipe');
        });
    }

};
