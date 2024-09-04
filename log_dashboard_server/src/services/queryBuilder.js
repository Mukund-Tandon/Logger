
const getSearchQuerWithFilters = (start = null, end = null, level = null, containsText = null, resourceId = null) => {
let query = "";
if(start ){
    query = query + `Timestamp >= toDateTime('${start}', 'UTC') AND `;
}
if(end){
    query = query + `Timestamp <= toDateTime('${end}', 'UTC') AND `;
}

if(level){
    query = query + `Level = '${level}' AND `;
}

if(containsText){
    query = query + `Message LIKE '%${containsText}%' AND `;
}

if(resourceId){
    query = query + `ResourceID = '${resourceId}' AND `;
}

//n check if quey ends with AND if so remove it
if(query.endsWith("AND ")){
    query = query.slice(0, -5);
}
return query;
}


module.exports = {
    getSearchQuerWithFilters
}