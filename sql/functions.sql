DELIMITER $$

create function `sortabletitle`(title     VARCHAR(256)) RETURNS varchar(1000) CHARSET utf8mb3
begin
  DECLARE label VARCHAR(1000) default title;

  SET label := LOWER(label);

  SET label := REGEXP_REPLACE(label, '(?i)der |die |das |the ', '');
  SET label := REGEXP_REPLACE(label, '[ä]+', 'a');
  SET label := REGEXP_REPLACE(label, '[ü]+', 'u');
  SET label := REGEXP_REPLACE(label, '[ö]+', 'o');
  SET label := REGEXP_REPLACE(label, '[ß]+', 'ss');
  SET label := REGEXP_REPLACE(label, '[^0-9a-zA-Z]+', '');

  RETURN label;
end

CREATE function
  createissuelabel(title     VARCHAR(256),
                   name      VARCHAR(256),
                   volume    INTEGER,
                   startyear INTEGER,
                   endyear   INTEGER,
                             number VARCHAR(256),
                   format    VARCHAR(256),
                   variant   VARCHAR(256),
                   issuetitle VARCHAR(256)) returns VARCHAR(1000) charset utf8
begin
  declare label  varchar(1000) default concat(createserieslabel(title, name, volume, startyear, endyear), ' #', number);
  declare format varchar(256) default concat(' (', format);
  if variant != '' then
    set format := concat(format, '/', variant);
  end if;
  set format := concat(format, ')');
  set label := concat(label, format);

  if issuetitle != '' then
    set label := concat(label, ': ', issuetitle);
  end if;

  return label;
end

$$

create function
  createlabel(type    VARCHAR(256),
            title     VARCHAR(256),
            name      VARCHAR(256),
            volume    INTEGER,
            startyear INTEGER,
            endyear   INTEGER,
                      number VARCHAR(256),
            format    VARCHAR(256),
            variant   VARCHAR(256),
            issuetitle VARCHAR(256)) returns VARCHAR(4096) charset utf8
  DETERMINISTIC
begin
  if type = 'publisher' then
  return title;
end if;
if type = 'series' then
return createserieslabel(title, name, volume, startyear, endyear);
end if;
if type = 'issue' then
return createissuelabel(title, name, volume, startyear, endyear, number, format, variant, issuetitle);
end IF;
end

$$

create function
  createserieslabel(title     VARCHAR(256),
                    name      VARCHAR(256),
                    volume    INTEGER,
                    startyear INTEGER,
                    endyear   INTEGER) returns VARCHAR(1000) charset utf8
  DETERMINISTIC
begin
  declare label     varchar(1000) default name;
  DECLARE years     VARCHAR(256) DEFAULT concat(' (', startyear);
  declare volume    varchar(256) default concat(' (Vol. ', toroman(volume), ') ');
  DECLARE publisher VARCHAR(256) DEFAULT concat(' (', title, ')');
  if endyear > startyear then
    set years := concat(years, '-', endyear);
  end if;
  set years := concat(years, ') ');
  set label := concat(label, volume, startyear, publisher);
  return label;
end

$$

create function
  createurl(type   VARCHAR(256),
          original TINYINT,
          title    VARCHAR(256),
          name     VARCHAR(256),
          volume   INTEGER,
                   number VARCHAR(256),
          format   VARCHAR(256),
          variant  VARCHAR(256)) returns VARCHAR(4096) charset utf8
  DETERMINISTIC
begin
  declare url varchar(4096) default '';
  if original = 1 then
    set url := '/us/';
  end if;
  if original = 0 then
    set url := '/de/';
  end if;
  set url := concat(url, urlencode(title));
  if type != 'publisher' then
  set url := concat(url, '/', urlencode(name), '_Vol_', volume);
  if type != 'series' then
  set url := concat(url, '/', urlencode(number), '/', urlencode(format));
  if variant != '' then
    set url := concat(url, '_', urlencode(variant));
  end if;
end if;
end if;
return url;
end

$$

create function
  fromroman(inroman VARCHAR(256)) returns INT(11)
  DETERMINISTIC
begin
  declare numeral  char(7) default 'IVXLCDM';
  DECLARE digit    TINYINT;
  declare previous int default 0;
  DECLARE current  INT;
  DECLARE sum      INT DEFAULT 0;
  set inroman = upper(inroman);
  while length(inroman) > 0 do
  set digit := locate(RIGHT(inroman, 1), numeral) - 1;
  set current := pow(10, floor(digit / 2)) * pow(5, MOD(digit, 2));
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

create function
  toroman(inarabic int UNSIGNED) returns VARCHAR(15) charset utf8
  deterministic
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

create function
  urlencode(str varchar(4096) charset utf8) returns VARCHAR(4096) charset utf8
  deterministic
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
