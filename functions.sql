DELIMITER $$

CREATE function 
  createissuelabel(title     VARCHAR(256), 
                   name      VARCHAR(256), 
                   volume    INTEGER, 
                   startyear INTEGER, 
                   endyear   INTEGER, 
                             number VARCHAR(256), 
                   format    VARCHAR(256), 
                   variant   VARCHAR(256)) returns VARCHAR(1000) 
begin 
  DECLARE label  VARCHAR(1000) DEFAULT concat(createserieslabel(title, name, volume, startyear, endyear), ' #', number);
  DECLARE format VARCHAR(256) DEFAULT concat(' (', format); 
  IF variant != '' THEN 
    SET format := concat(format, '/', variant); 
  end IF; 
  SET format := concat(format, ')'); 
  SET label := concat(label, format); 
  RETURN label; 
end 

$$

CREATE function 
  createlabel(type    VARCHAR(256), 
            title     VARCHAR(256), 
            name      VARCHAR(256), 
            volume    INTEGER, 
            startyear INTEGER, 
            endyear   INTEGER, 
                      number VARCHAR(256), 
            format    VARCHAR(256), 
            variant   VARCHAR(256)) returns VARCHAR(4096) charset latin1 
  DETERMINISTIC 
begin 
  IF type = 'publisher' THEN 
  RETURN title; 
end IF; 
IF type = 'series' THEN 
RETURN createserieslabel(title, name, volume, startyear, endyear); 
end IF; 
IF type = 'issue' THEN 
RETURN createissuelabel(title, name, volume, startyear, endyear, number, format, variant); 
end IF; 
end 

$$

CREATE function 
  createserieslabel(title     VARCHAR(256), 
                    name      VARCHAR(256), 
                    volume    INTEGER, 
                    startyear INTEGER, 
                    endyear   INTEGER) returns VARCHAR(1000) charset latin1 
  DETERMINISTIC 
begin 
  DECLARE label     VARCHAR(1000) DEFAULT name; 
  DECLARE years     VARCHAR(256) DEFAULT concat(' (', startyear); 
  DECLARE volume    VARCHAR(256) DEFAULT concat(' (Vol. ', toroman(volume), ') '); 
  DECLARE publisher VARCHAR(256) DEFAULT concat(' (', title, ')'); 
  IF endyear > startyear THEN 
    SET years := concat(years, '-', endyear); 
  end IF; 
  SET years := concat(years, ') '); 
  SET label := concat(label, volume, startyear, publisher); 
  RETURN label; 
end 

$$

CREATE function 
  createurl(type   VARCHAR(256), 
          original TINYINT, 
          title    VARCHAR(256), 
          name     VARCHAR(256), 
          volume   INTEGER, 
                   number VARCHAR(256), 
          format   VARCHAR(256), 
          variant  VARCHAR(256)) returns VARCHAR(4096) charset latin1 
  DETERMINISTIC 
begin 
  DECLARE url VARCHAR(4096) DEFAULT ''; 
  IF original = 1 THEN 
    SET url := '/us/'; 
  end IF; 
  IF original = 0 THEN 
    SET url := '/de/'; 
  end IF; 
  SET url := concat(url, urlencode(title)); 
  IF type != 'publisher' THEN 
  SET url := concat(url, '/', urlencode(name), '_Vol_', volume);
  IF type != 'series' THEN 
  SET url := concat(url, '/', urlencode(number), '/', urlencode(format));
  IF variant != '' THEN 
    SET url := concat(url, '_', urlencode(variant));
  end IF; 
end IF; 
end IF; 
RETURN url; 
end 

$$

CREATE function 
  fromroman(inroman VARCHAR(256)) returns INT(11) 
  DETERMINISTIC 
begin 
  DECLARE numeral  CHAR(7) DEFAULT 'IVXLCDM'; 
  DECLARE digit    TINYINT; 
  DECLARE previous INT DEFAULT 0; 
  DECLARE current  INT; 
  DECLARE sum      INT DEFAULT 0; 
  SET inroman = upper(inroman); 
  WHILE length(inroman) > 0 do 
  SET digit := locate(RIGHT(inroman, 1), numeral) - 1; 
  SET current := pow(10, floor(digit / 2)) * pow(5, MOD(digit, 2)); 
  IF current = 0 THEN 
    RETURN 0; 
  end IF; 
  SET sum := sum + pow(-1, current < previous) * current; 
  SET previous := current; 
  SET inroman = LEFT(inroman, length(inroman) - 1); 
end WHILE; 
RETURN sum; 
end 

$$

CREATE function 
  toroman(inarabic INT UNSIGNED) returns VARCHAR(15) charset latin1 
  DETERMINISTIC 
begin 
  DECLARE numeral      CHAR(7) DEFAULT 'IVXLCDM'; 
  DECLARE stringinuse  CHAR(3); 
  DECLARE position     TINYINT DEFAULT 1; 
  DECLARE currentdigit TINYINT; 
  DECLARE returnvalue  VARCHAR(15) DEFAULT ''; 
  IF(inarabic > 3999) THEN 
    RETURN 'overflow'; 
  end IF; 
  IF(inarabic = 0) THEN 
    RETURN 'N'; 
  end IF; 
  WHILE position <= ceil(log10(inarabic  + .1)) do 
  SET currentdigit := MOD(floor(inarabic / pow(10, position - 1)), 10); 
  SET returnvalue := concat( 
  CASE currentdigit 
  WHEN 4 THEN 
    concat(substring(numeral, position * 2 - 1, 1), substring(numeral, position * 2, 1)) 
  WHEN 9 THEN 
    concat(substring(numeral, position * 2 - 1, 1), substring(numeral, position * 2 + 1, 1)) 
  ELSE 
    concat( 
    REPEAT(substring(numeral, position   * 2, 1), currentdigit >= 5), 
      REPEAT(substring(numeral, position * 2 - 1, 1), MOD(currentdigit, 5)) 
    ) 
  end, 
  returnvalue); 
  SET position := position + 1; 
end WHILE; 
RETURN returnvalue; 
end 

$$

CREATE function 
  urlencode(str VARCHAR(4096) charset utf8) returns VARCHAR(4096) charset utf8 
  DETERMINISTIC 
begin 
  -- the individual character we are converting in our loop 
  -- NOTE: must be VARCHAR even though it won't vary in length 
  -- CHAR(1), when used with SUBSTRING, made spaces '' instead of ' ' 
  DECLARE sub VARCHAR(1) charset utf8; 
  -- the ordinal value of the character (i.e. ñ becomes 50097) 
  DECLARE val BIGINT DEFAULT 0; 
  -- the substring index we use in our loop (one-based) 
  DECLARE ind INT DEFAULT 1; 
  -- the integer value of the individual octet of a character being encoded 
  -- (which is potentially multi-byte and must be encoded one byte at a time) 
  DECLARE oct INT DEFAULT 0; 
  -- the encoded return string that we build up during execution 
  DECLARE ret VARCHAR(4096) DEFAULT ''; 
  -- our loop index for looping through each octet while encoding 
  DECLARE octind INT DEFAULT 0; 
  IF isnull(str) THEN 
    RETURN NULL; 
  ELSE 
    SET ret = ''; 
    -- loop through the input string one character at a time - regardless 
    -- of how many bytes a character consists of 
    WHILE ind <= char_length(str) do 
    SET sub = mid(str, ind, 1); 
    SET val = ord(sub); 
    -- these values are ones that should not be converted 
    -- see http://tools.ietf.org/html/rfc3986 
    IF NOT 
      ( 
        val BETWEEN 48 AND 57 OR  -- 48-57  = 0-9 
        val BETWEEN 65 AND 90 OR  -- 65-90  = A-Z 
        val BETWEEN 97 AND 122 OR -- 97-122 = a-z 
        -- 45 = hyphen, 46 = period, 95 = underscore, 126 = tilde 
        val IN (45, 
                46, 
                95, 
                126) 
      ) 
      THEN 
      -- This is not an "unreserved" char and must be encoded: 
      -- loop through each octet of the potentially multi-octet character 
      -- and convert each into its hexadecimal value 
      -- we start with the high octect because that is the order that ORD 
      -- returns them in - they need to be encoded with the most significant 
      -- byte first 
      SET octind = octet_length(sub); 
      WHILE octind > 0 do 
      -- get the actual value of this octet by shifting it to the right 
      -- so that it is at the lowest byte position - in other words, make 
      -- the octet/byte we are working on the entire number (or in even 
      -- other words, oct will no be between zero and 255 inclusive) 
      SET oct = (val >> (8 * (octind - 1))); 
      -- we append this to our return string with a percent sign, and then 
      -- a left-zero-padded (to two characters) string of the hexadecimal 
      -- value of this octet) 
      SET ret = concat(ret, '%', lpad(hex(oct), 2, 0)); 
      -- now we need to reset val to essentially zero out the octet that we 
      -- just encoded so that our number decreases and we are only left with 
      -- the lower octets as part of our integer 
      SET val = (val & (power(256, (octind - 1)) - 1)); 
      SET octind = (octind - 1); 
    end WHILE; 
  ELSE 
    -- this character was not one that needed to be encoded and can simply be 
    -- added to our return string as-is 
    SET ret = concat(ret, sub); 
  end IF; 
  SET ind = (ind + 1); 
end WHILE; 
end IF; 
RETURN ret; 
end

$$

DELIMITER ;
