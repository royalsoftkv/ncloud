const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(process.cwd()+'/database.db');


global.storeData = (params, cb) => {
    let name = params.name
    let property = params.property
    let value = params.value
    db.run(`insert into data (time, name, property, value) values(${Date.now()}, '${name}','${property}','${value}')`,[], (res, err)=>{
        if(typeof cb === 'function') {
            cb(res, err)
        }
    });
}

global.getData = async (params) => {
    let name = params.name
    let property = params.property
    let sql = `select * from data where name= ? and property = ? limit 1`
    let sqlParams = [name, property]
    return await new Promise(resolve => {
        db.all(sql, sqlParams, (err, rows) => {
            resolve(rows[0].value)
        })
    })
}

global.readData = async (params) => {
    let name = params.name
    let property = params.property
    let from = params.filter.from
    let to = params.filter.to
    let limit = params.filter.limit
    let offset = params.filter.offset
    let sql = `select * from data where name= ? and property = ?`
    let sqlParams = [name, property]
    if(!from && !to) {
        sql += ` order by time desc`
        limit = 1
        offset = 0
    } else if (from && !to) {
        sql += ` and time > ? order by time desc`
        sqlParams.push(from)
    } else if (!from && to) {
        sql += ` and time < ? order by time desc`
        sqlParams.push(to)
    } else {
        sql += ` and time ? ? and time < ? order by time desc`
        sqlParams.push(from)
        sqlParams.push(to)
    }
    if(limit) {
        sql += ` limit ${limit} `
    }
    if(offset) {
        sql += `, ${offset}`;
    }
    let rows = await new Promise(resolve => {
        db.all(sql, sqlParams, (err, rows)=>{
            resolve(rows)
        })
    })
    return rows

}

global.execSQL = async(params) => {
    let rows = await new Promise(resolve => {
        db.all(params.sql, params.params, (err, rows)=>{
            resolve(rows)
        })
    })
    return rows
}

global.dbexplorer = async (params) => {
    let page = params.page
    let perPage = params.perPage
    let sortColumn = params.sortColumn
    let sortAsc = params.sortAsc
    let filterColumns = params.filterColumns

    let sql_cond = ''
    for(let k in filterColumns) {
        if(filterColumns[k]) {
            sql_cond += ` and ${k} = '${filterColumns[k]}' `;
        }
    }

    let sql_count = `select count(*) as cnt from data where 1=1 ${sql_cond} `;

    let count = await new Promise(resolve => {
        db.get(sql_count, {}, (err, row)=>{
            resolve(row.cnt)
        })
    })

    let limit = perPage;
    let offset = (page-1)*limit;
    sql=`select * from data where 1=1 ${sql_cond} order by ${sortColumn} ${sortAsc?'asc':'desc'} limit ${offset},${limit}`;
    let rows = await new Promise(resolve => {
        db.all(sql, {}, (err, rows)=>{
            resolve(rows)
        })
    })
    return {count,rows}
}

module.exports = {

}

db.run('create table if not exists data ( id integer primary key autoincrement, time timestamp, name string, property string, value string)');
