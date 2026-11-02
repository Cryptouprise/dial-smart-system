select table_name
from information_schema.tables
where table_schema = 'public'
  and (table_name like 'd2d%' or table_name like 'wh_%' or table_name like 'door%'
       or table_name like '%knock%' or table_name like '%propert%' or table_name like 'pack%'
       or table_name like 'coach%' or table_name like 'call_live%')
order by table_name;
