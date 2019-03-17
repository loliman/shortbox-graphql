import {ApolloServer} from 'apollo-server';
import {merge} from 'lodash';
import models from '../models';
import {createContext, EXPECTED_OPTIONS_KEY} from 'dataloader-sequelize';
import {resolver} from 'graphql-sequelize';
import {resolvers as CoverResolvers, typeDef as CoverTypeDefs} from '../models/Cover';
import {resolvers as FeatureResolvers, typeDef as FeatureTypeDefs} from '../models/Feature';
import {resolvers as IndividualResolvers, typeDef as IndividualTypeDefs} from '../models/Individual';
import {resolvers as IssueResolvers, typeDef as IssueTypeDefs} from '../models/Issue';
import {resolvers as PublisherResolvers, typeDef as PublisherTypeDefs} from '../models/Publisher';
import {resolvers as SeriesResolvers, typeDef as SeriesTypeDefs} from '../models/Series';
import {resolvers as StoryResolvers, typeDef as StoryTypeDefs} from '../models/Story';
import {resolvers as UserResolvers, typeDef as UserTypeDefs} from '../models/User';
import {resolvers as ScalarResolvers, typeDef as ScalarTypeDefs} from '../graphql/generic';

resolver.contextToOptions = {dataloader: EXPECTED_OPTIONS_KEY};

const server = new ApolloServer({
    typeDefs: [ScalarTypeDefs, PublisherTypeDefs, UserTypeDefs,
        CoverTypeDefs, FeatureTypeDefs, IndividualTypeDefs,
        IssueTypeDefs, SeriesTypeDefs, StoryTypeDefs],
    resolvers: merge(ScalarResolvers, PublisherResolvers, UserResolvers,
        CoverResolvers, FeatureResolvers, IndividualResolvers,
        IssueResolvers, SeriesResolvers, StoryResolvers),
    context: async ({req}) => {
        let loggedIn = false;
        if (req.headers.authorization) {
            let userid = req.headers.authorization.split(/:(.+)/)[0];
            let sessionid = req.headers.authorization.split(/:(.+)/)[1];

            let user = await models.User.count({where: {id: userid, sessionid: sessionid}});
            if (user === 1)
                loggedIn = true;
        }

        const dataloader = createContext(models.sequelize);

        let isMutation = req.body.query.indexOf('mutation') === 0;

        loggedIn = true;
        if(isMutation) {
            const transaction = await models.sequelize.transaction();
            return {loggedIn, dataloader, transaction};
        } else {
            return {loggedIn, dataloader};
        }

    },
    uploads: {
        maxFileSize: 10000000 // 10 MB
    }
});

export default server;