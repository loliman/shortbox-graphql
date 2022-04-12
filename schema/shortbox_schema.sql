# ************************************************************
# Sequel Pro SQL dump
# Version 4541
#
# http://www.sequelpro.com/
# https://github.com/sequelpro/sequelpro
#
# Host: 127.0.0.1 (MySQL 5.5.5-10.1.21-MariaDB)
# Datenbank: shortbox
# Erstellt am: 2021-02-13 16:54:59 +0000
# ************************************************************


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


# Export von Tabelle Appearance
# ------------------------------------------------------------

DROP TABLE IF EXISTS `Appearance`;

CREATE TABLE `Appearance` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `type` varchar(255) NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `appearance_name_type` (`name`,`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



# Export von Tabelle Arc
# ------------------------------------------------------------

DROP TABLE IF EXISTS `Arc`;

CREATE TABLE `Arc` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `type` varchar(255) NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `arc_title_type` (`title`,`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



# Export von Tabelle Cover
# ------------------------------------------------------------

DROP TABLE IF EXISTS `Cover`;

CREATE TABLE `Cover` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `url` varchar(255) NOT NULL DEFAULT '',
  `number` int(11) NOT NULL,
  `coloured` tinyint(1) DEFAULT '1',
  `fullsize` tinyint(1) DEFAULT '1',
  `addinfo` varchar(255) NOT NULL DEFAULT '',
  `onlyapp` tinyint(1) DEFAULT '0',
  `firstapp` tinyint(1) DEFAULT '0',
  `firstpartly` tinyint(1) DEFAULT '0',
  `firstcomplete` tinyint(1) DEFAULT '0',
  `firstmonochrome` tinyint(1) DEFAULT '0',
  `firstcoloured` tinyint(1) DEFAULT '0',
  `firstsmall` tinyint(1) DEFAULT '0',
  `firstfullsize` tinyint(1) DEFAULT '0',
  `onlytb` tinyint(1) DEFAULT '0',
  `onlyoneprint` tinyint(1) DEFAULT '0',
  `onlypartly` tinyint(1) DEFAULT '0',
  `onlymonochrome` tinyint(1) DEFAULT '0',
  `onlysmall` tinyint(1) DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `fk_parent` int(11) DEFAULT NULL,
  `fk_issue` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cover_fk_parent_fk_issue_number` (`fk_parent`,`fk_issue`,`number`),
  KEY `fk_issue` (`fk_issue`),
  CONSTRAINT `cover_ibfk_1` FOREIGN KEY (`fk_parent`) REFERENCES `Cover` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `cover_ibfk_2` FOREIGN KEY (`fk_issue`) REFERENCES `Issue` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



# Export von Tabelle Cover_Individual
# ------------------------------------------------------------

DROP TABLE IF EXISTS `Cover_Individual`;

CREATE TABLE `Cover_Individual` (
  `fk_cover` int(11) NOT NULL,
  `fk_individual` int(11) NOT NULL,
  `type` varchar(255) NOT NULL,
  PRIMARY KEY (`fk_cover`,`fk_individual`,`type`),
  KEY `fk_individual` (`fk_individual`),
  CONSTRAINT `cover_individual_ibfk_1` FOREIGN KEY (`fk_cover`) REFERENCES `Cover` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `cover_individual_ibfk_2` FOREIGN KEY (`fk_individual`) REFERENCES `Individual` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



# Export von Tabelle Feature
# ------------------------------------------------------------

DROP TABLE IF EXISTS `Feature`;

CREATE TABLE `Feature` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `number` int(11) NOT NULL,
  `addinfo` varchar(255) NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `fk_issue` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `feature_title_fk_issue_number` (`title`,`fk_issue`,`number`),
  KEY `fk_issue` (`fk_issue`),
  CONSTRAINT `feature_ibfk_1` FOREIGN KEY (`fk_issue`) REFERENCES `Issue` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



# Export von Tabelle Feature_Individual
# ------------------------------------------------------------

DROP TABLE IF EXISTS `Feature_Individual`;

CREATE TABLE `Feature_Individual` (
  `fk_feature` int(11) NOT NULL,
  `fk_individual` int(11) NOT NULL,
  `type` varchar(255) NOT NULL,
  PRIMARY KEY (`fk_feature`,`fk_individual`,`type`),
  KEY `fk_individual` (`fk_individual`),
  CONSTRAINT `feature_individual_ibfk_1` FOREIGN KEY (`fk_feature`) REFERENCES `Feature` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `feature_individual_ibfk_2` FOREIGN KEY (`fk_individual`) REFERENCES `Individual` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



# Export von Tabelle Individual
# ------------------------------------------------------------

DROP TABLE IF EXISTS `Individual`;

CREATE TABLE `Individual` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `individual_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



# Export von Tabelle Issue
# ------------------------------------------------------------

DROP TABLE IF EXISTS `Issue`;

CREATE TABLE `Issue` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL DEFAULT '',
  `number` varchar(255) NOT NULL,
  `format` varchar(255) NOT NULL DEFAULT '',
  `limitation` int(11) DEFAULT '0',
  `variant` varchar(255) NOT NULL DEFAULT '',
  `releasedate` datetime DEFAULT NULL,
  `pages` int(11) DEFAULT '0',
  `price` float DEFAULT NULL,
  `currency` varchar(255) DEFAULT NULL,
  `addinfo` varchar(255) NOT NULL DEFAULT '',
  `verified` tinyint(1) NOT NULL DEFAULT '0',
  `edited` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `fk_series` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `issue_number_fk_series_format_variant` (`number`,`fk_series`,`format`,`variant`),
  KEY `fk_series` (`fk_series`),
  KEY `issue_id` (`id`),
  KEY `issue_number_format_variant` (`number`,`format`,`variant`),
  CONSTRAINT `issue_ibfk_1` FOREIGN KEY (`fk_series`) REFERENCES `Series` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



# Export von Tabelle Issue_Arc
# ------------------------------------------------------------

DROP TABLE IF EXISTS `Issue_Arc`;

CREATE TABLE `Issue_Arc` (
  `fk_issue` int(11) NOT NULL,
  `fk_arc` int(11) NOT NULL,
  PRIMARY KEY (`fk_issue`,`fk_arc`),
  UNIQUE KEY `Issue_Arc_fk_issue_fk_arc_unique` (`fk_issue`,`fk_arc`),
  KEY `fk_arc` (`fk_arc`),
  CONSTRAINT `issue_arc_ibfk_1` FOREIGN KEY (`fk_issue`) REFERENCES `Issue` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `issue_arc_ibfk_2` FOREIGN KEY (`fk_arc`) REFERENCES `Arc` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



# Export von Tabelle Issue_Individual
# ------------------------------------------------------------

DROP TABLE IF EXISTS `Issue_Individual`;

CREATE TABLE `Issue_Individual` (
  `fk_issue` int(11) NOT NULL,
  `fk_individual` int(11) NOT NULL,
  `type` varchar(255) NOT NULL,
  PRIMARY KEY (`fk_issue`,`fk_individual`,`type`),
  KEY `fk_individual` (`fk_individual`),
  CONSTRAINT `issue_individual_ibfk_1` FOREIGN KEY (`fk_issue`) REFERENCES `Issue` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `issue_individual_ibfk_2` FOREIGN KEY (`fk_individual`) REFERENCES `Individual` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



# Export von Tabelle Publisher
# ------------------------------------------------------------

DROP TABLE IF EXISTS `Publisher`;

CREATE TABLE `Publisher` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `us` tinyint(1) NOT NULL DEFAULT '0',
  `addinfo` varchar(255) NOT NULL DEFAULT '',
  `startyear` int(11) NOT NULL DEFAULT '0',
  `endyear` int(11) DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `publisher_name` (`name`),
  KEY `publisher_id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



# Export von Tabelle Series
# ------------------------------------------------------------

DROP TABLE IF EXISTS `Series`;

CREATE TABLE `Series` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) DEFAULT NULL,
  `startyear` int(11) NOT NULL DEFAULT '0',
  `endyear` int(11) DEFAULT '0',
  `genre` varchar(255) DEFAULT NULL,
  `volume` int(11) NOT NULL,
  `addinfo` varchar(255) NOT NULL DEFAULT '',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `fk_publisher` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `series_title_volume_fk_publisher` (`title`,`volume`,`fk_publisher`),
  KEY `fk_publisher` (`fk_publisher`),
  KEY `series_id` (`id`),
  KEY `series_title_volume` (`title`,`volume`),
  CONSTRAINT `series_ibfk_1` FOREIGN KEY (`fk_publisher`) REFERENCES `Publisher` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



# Export von Tabelle Story
# ------------------------------------------------------------

DROP TABLE IF EXISTS `Story`;

CREATE TABLE `Story` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `number` int(11) NOT NULL,
  `pages` varchar(255) DEFAULT NULL,
  `coloured` tinyint(1) DEFAULT '1',
  `addinfo` varchar(255) NOT NULL DEFAULT '',
  `onlyapp` tinyint(1) DEFAULT '0',
  `firstapp` tinyint(1) DEFAULT '0',
  `firstpartly` tinyint(1) DEFAULT '0',
  `firstcomplete` tinyint(1) DEFAULT '0',
  `firstmonochrome` tinyint(1) DEFAULT '0',
  `firstcoloured` tinyint(1) DEFAULT '0',
  `onlytb` tinyint(1) DEFAULT '0',
  `onlyoneprint` tinyint(1) DEFAULT '0',
  `onlypartly` tinyint(1) DEFAULT '0',
  `onlymonochrome` tinyint(1) DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `fk_issue` int(11) DEFAULT NULL,
  `fk_parent` int(11) DEFAULT NULL,
  `fk_reprint` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `story_fk_issue_fk_parent_addinfo_number` (`fk_issue`,`fk_parent`,`addinfo`,`number`),
  KEY `fk_parent` (`fk_parent`),
  KEY `fk_reprint` (`fk_reprint`),
  CONSTRAINT `story_ibfk_1` FOREIGN KEY (`fk_issue`) REFERENCES `Issue` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `story_ibfk_2` FOREIGN KEY (`fk_parent`) REFERENCES `Story` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `story_ibfk_3` FOREIGN KEY (`fk_reprint`) REFERENCES `Story` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



# Export von Tabelle Story_Appearance
# ------------------------------------------------------------

DROP TABLE IF EXISTS `Story_Appearance`;

CREATE TABLE `Story_Appearance` (
  `fk_appearance` int(11) NOT NULL,
  `fk_story` int(11) NOT NULL,
  `role` varchar(255) NOT NULL,
  `firstapp` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`fk_appearance`,`fk_story`,`role`),
  KEY `fk_story` (`fk_story`),
  CONSTRAINT `story_appearance_ibfk_1` FOREIGN KEY (`fk_appearance`) REFERENCES `Appearance` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `story_appearance_ibfk_2` FOREIGN KEY (`fk_story`) REFERENCES `Story` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



# Export von Tabelle Story_Individual
# ------------------------------------------------------------

DROP TABLE IF EXISTS `Story_Individual`;

CREATE TABLE `Story_Individual` (
  `fk_story` int(11) NOT NULL,
  `fk_individual` int(11) NOT NULL,
  `type` varchar(255) NOT NULL,
  PRIMARY KEY (`fk_story`,`fk_individual`,`type`),
  KEY `fk_individual` (`fk_individual`),
  CONSTRAINT `story_individual_ibfk_1` FOREIGN KEY (`fk_story`) REFERENCES `Story` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `story_individual_ibfk_2` FOREIGN KEY (`fk_individual`) REFERENCES `Individual` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



# Export von Tabelle User
# ------------------------------------------------------------

DROP TABLE IF EXISTS `User`;

CREATE TABLE `User` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `sessionid` varchar(255) DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;




--
-- Dumping routines (FUNCTION) for database 'shortbox'
--
DELIMITER ;;

# Dump of FUNCTION createissuelabel
# ------------------------------------------------------------

/*!50003 DROP FUNCTION IF EXISTS `createissuelabel` */;;
/*!50003 SET SESSION SQL_MODE="NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION"*/;;
/*!50003 CREATE*/ /*!50020 DEFINER=`root`@`localhost`*/ /*!50003 FUNCTION `createissuelabel`(title     VARCHAR(256), 
                   name      VARCHAR(256), 
                   volume    INTEGER, 
                   startyear INTEGER, 
                   endyear   INTEGER, 
                             number VARCHAR(256), 
                   format    VARCHAR(256), 
                   variant   VARCHAR(256)) RETURNS varchar(1000) CHARSET utf8
begin 
  DECLARE label  VARCHAR(1000) DEFAULT concat(createserieslabel(title, name, volume, startyear, endyear), ' #', number);
  DECLARE format VARCHAR(256) DEFAULT concat(' (', format); 
  IF variant != '' THEN 
    SET format := concat(format, '/', variant);
  end IF; 
  SET format := concat(format, ')'); 
  SET label := concat(label, format); 
  RETURN label; 
end */;;

/*!50003 SET SESSION SQL_MODE=@OLD_SQL_MODE */;;
# Dump of FUNCTION createlabel
# ------------------------------------------------------------

/*!50003 DROP FUNCTION IF EXISTS `createlabel` */;;
/*!50003 SET SESSION SQL_MODE="NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION"*/;;
/*!50003 CREATE*/ /*!50020 DEFINER=`root`@`localhost`*/ /*!50003 FUNCTION `createlabel`(type    VARCHAR(256), 
            title     VARCHAR(256), 
            name      VARCHAR(256), 
            volume    INTEGER, 
            startyear INTEGER, 
            endyear   INTEGER, 
                      number VARCHAR(256), 
            format    VARCHAR(256), 
            variant   VARCHAR(256)) RETURNS varchar(4096) CHARSET utf8
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
end */;;

/*!50003 SET SESSION SQL_MODE=@OLD_SQL_MODE */;;
# Dump of FUNCTION createserieslabel
# ------------------------------------------------------------

/*!50003 DROP FUNCTION IF EXISTS `createserieslabel` */;;
/*!50003 SET SESSION SQL_MODE="NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION"*/;;
/*!50003 CREATE*/ /*!50020 DEFINER=`root`@`localhost`*/ /*!50003 FUNCTION `createserieslabel`(title     VARCHAR(256), 
                    name      VARCHAR(256), 
                    volume    INTEGER, 
                    startyear INTEGER, 
                    endyear   INTEGER) RETURNS varchar(1000) CHARSET utf8
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
end */;;

/*!50003 SET SESSION SQL_MODE=@OLD_SQL_MODE */;;
# Dump of FUNCTION createurl
# ------------------------------------------------------------

/*!50003 DROP FUNCTION IF EXISTS `createurl` */;;
/*!50003 SET SESSION SQL_MODE="NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION"*/;;
/*!50003 CREATE*/ /*!50020 DEFINER=`root`@`localhost`*/ /*!50003 FUNCTION `createurl`(type   VARCHAR(256), 
          us TINYINT,
          title    VARCHAR(256), 
          name     VARCHAR(256), 
          volume   INTEGER, 
                   number VARCHAR(256), 
          format   VARCHAR(256), 
          variant  VARCHAR(256)) RETURNS varchar(4096) CHARSET utf8
    DETERMINISTIC
begin 
  DECLARE url VARCHAR(4096) DEFAULT ''; 
  IF us = 1 THEN
    SET url := '/us/'; 
  end IF; 
  IF us = 0 THEN
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
end */;;

/*!50003 SET SESSION SQL_MODE=@OLD_SQL_MODE */;;
# Dump of FUNCTION fromroman
# ------------------------------------------------------------

/*!50003 DROP FUNCTION IF EXISTS `fromroman` */;;
/*!50003 SET SESSION SQL_MODE="NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION"*/;;
/*!50003 CREATE*/ /*!50020 DEFINER=`root`@`localhost`*/ /*!50003 FUNCTION `fromroman`(inroman VARCHAR(256)) RETURNS int(11)
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
end */;;

/*!50003 SET SESSION SQL_MODE=@OLD_SQL_MODE */;;
# Dump of FUNCTION toroman
# ------------------------------------------------------------

/*!50003 DROP FUNCTION IF EXISTS `toroman` */;;
/*!50003 SET SESSION SQL_MODE="NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION"*/;;
/*!50003 CREATE*/ /*!50020 DEFINER=`root`@`localhost`*/ /*!50003 FUNCTION `toroman`(inarabic INT UNSIGNED) RETURNS varchar(15) CHARSET utf8
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
end */;;

/*!50003 SET SESSION SQL_MODE=@OLD_SQL_MODE */;;
# Dump of FUNCTION urlencode
# ------------------------------------------------------------

/*!50003 DROP FUNCTION IF EXISTS `urlencode` */;;
/*!50003 SET SESSION SQL_MODE="NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION"*/;;
/*!50003 CREATE*/ /*!50020 DEFINER=`root`@`localhost`*/ /*!50003 FUNCTION `urlencode`(str VARCHAR(4096) charset utf8) RETURNS varchar(4096) CHARSET utf8
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
end */;;

/*!50003 SET SESSION SQL_MODE=@OLD_SQL_MODE */;;
DELIMITER ;

/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
